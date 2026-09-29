"""
OceanEmbed Deep Learning Model
================================
Architecture: multi-scale residual U-Net encoder (satellite embedding) + per-pixel MLP depth decoder

Input  x:      (B, 7, H, W)  -- sst, sss, sla, u_cur, v_cur, u_wind, v_wind
       lat/lon (B, H, W)     -- degrees
       doy     (B,)          -- day of year
       static  (B, 2, H, W)  -- ocean mask, fraction of depth levels above seafloor
       present (B, 7, H, W)  -- optional per-channel "input is observed" mask
Output y:      (B, 15, H, W) -- temperature (°C) at the 15 standard depths
           [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000] m
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

STD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
N_SURFACE = 7
N_AUX = 6  # sin/cos doy, lat, lon, ocean mask, seafloor
LAT_CENTER, LAT_SCALE = 15.0, 7.0
LON_CENTER, LON_SCALE = 90.0, 10.0


def _gn(ch):
    return nn.GroupNorm(8, ch)


class ResBlock(nn.Module):
    def __init__(self, ch, dropout=0.0):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv2d(ch, ch, 3, padding=1, bias=False), _gn(ch), nn.SiLU(inplace=True),
            nn.Dropout2d(dropout),
            nn.Conv2d(ch, ch, 3, padding=1, bias=False), _gn(ch),
        )
        self.act = nn.SiLU(inplace=True)

    def forward(self, x):
        return self.act(self.body(x) + x)


def _stage(in_c, out_c, n_blocks, stride=1, dropout=0.0):
    return nn.Sequential(
        nn.Conv2d(in_c, out_c, 3, stride=stride, padding=1, bias=False), _gn(out_c), nn.SiLU(inplace=True),
        *[ResBlock(out_c, dropout) for _ in range(n_blocks)],
    )


class DepthDecoder(nn.Module):
    """Per-pixel depth decoder via 1x1 convolutions."""
    def __init__(self, in_c, out_d=15, hidden=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_c, hidden, 1), nn.SiLU(inplace=True),
            nn.Conv2d(hidden, hidden, 1), nn.SiLU(inplace=True),
            nn.Conv2d(hidden, out_d, 1),
        )

    def forward(self, x):
        return self.net(x)


class OceanEmbedNet(nn.Module):
    """
    Satellite Embedding Network for Subsurface Ocean Temperature Reconstruction.
    Maps 7 surface satellite fields -> 15-depth temperature water column.
    """
    def __init__(self, emb_ch=64, out_d=15, dropout=0.1, use_doy=True, sst_demean=False):
        super().__init__()
        # With a single-season dataset, day-of-year acts as a date index and does not extrapolate
        self.use_doy = use_doy
        # Feed the CNN only the spatial SST pattern; the basin-mean level reaches the output via sst_slope alone
        self.sst_demean = sst_demean
        # Normalisation stats are overwritten from the training split (see train.py)
        self.register_buffer('x_mean', torch.zeros(N_SURFACE))
        self.register_buffer('x_std', torch.ones(N_SURFACE))
        self.register_buffer('y_mean', torch.zeros(out_d))
        self.register_buffer('y_std', torch.ones(out_d))
        # Fixed per-depth SST skip: y = slope_d * (SST - mean) + residual. Set from the training data;
        # not learned, since fitting it on one season shrinks it and breaks extrapolation to warmer days.
        self.register_buffer('sst_slope', torch.zeros(out_d))

        in_ch = N_SURFACE + N_AUX
        c1, c2, c3 = emb_ch, emb_ch * 2, emb_ch * 3
        self.enc1 = _stage(in_ch, c1, 2)
        self.enc2 = _stage(c1, c2, 2, stride=2, dropout=dropout)
        self.enc3 = _stage(c2, c3, 3, stride=2, dropout=dropout)
        self.up2 = _stage(c3 + c2, c2, 1)
        self.up1 = _stage(c2 + c1, emb_ch, 1)
        self.decoder = DepthDecoder(emb_ch + in_ch, out_d)

    def set_stats(self, x_mean, x_std, y_mean, y_std, sst_slope=None):
        for name, v in dict(x_mean=x_mean, x_std=x_std, y_mean=y_mean, y_std=y_std).items():
            getattr(self, name).data.copy_(torch.as_tensor(v, dtype=torch.float32))
        if sst_slope is not None:
            self.sst_slope.copy_(torch.as_tensor(sst_slope, dtype=torch.float32))

    def _inputs(self, x, lat, lon, doy, static=None, present=None):
        B, _, H, W = x.shape
        x_n = (x - self.x_mean.view(1, -1, 1, 1)) / (self.x_std.view(1, -1, 1, 1) + 1e-6)
        if self.sst_demean:
            w = present[:, :1].to(x_n.dtype) if present is not None else torch.ones_like(x_n[:, :1])
            day_mean = (x_n[:, :1] * w).sum((2, 3), keepdim=True) / w.sum((2, 3), keepdim=True).clamp_min(1)
            x_n = torch.cat([x_n[:, :1] - day_mean, x_n[:, 1:]], 1)
        if present is not None:
            x_n = x_n * present.to(x_n.dtype)
        if static is None:
            static = torch.ones(B, 2, H, W, device=x.device)
        ang = 2 * torch.pi * doy.float().view(B, 1, 1, 1) / 365.25
        if not self.use_doy:
            ang = torch.zeros_like(ang)
        aux = torch.cat([
            torch.sin(ang).expand(B, 1, H, W),
            torch.cos(ang).expand(B, 1, H, W),
            ((lat - LAT_CENTER) / LAT_SCALE).unsqueeze(1),
            ((lon - LON_CENTER) / LON_SCALE).unsqueeze(1),
            static,
        ], dim=1)
        return torch.cat([x_n, aux], dim=1)

    def _features(self, inp):
        e1 = self.enc1(inp)
        e2 = self.enc2(e1)
        e3 = self.enc3(e2)
        d2 = self.up2(torch.cat([F.interpolate(e3, size=e2.shape[-2:], mode='bilinear', align_corners=False), e2], 1))
        d1 = self.up1(torch.cat([F.interpolate(d2, size=e1.shape[-2:], mode='bilinear', align_corners=False), e1], 1))
        return d1

    def forward(self, x, lat, lon, doy, static=None, present=None, return_embedding=False):
        inp = self._inputs(x, lat, lon, doy, static, present)
        emb = self._features(inp)
        y_n = self.decoder(torch.cat([emb, inp], 1))
        sst_anom = x[:, :1] - self.x_mean[0]
        if present is not None:
            sst_anom = sst_anom * present[:, :1].to(x.dtype)
        y = self.sst_slope.view(1, -1, 1, 1) * sst_anom + y_n * self.y_std.view(1, -1, 1, 1) + self.y_mean.view(1, -1, 1, 1)
        return (y, emb) if return_embedding else y


class OceanEmbedLoss(nn.Module):
    """Masked MSE (°C²) + physics-aware stratification penalty below the mixed layer."""
    def __init__(self, lambda_strat=0.05):
        super().__init__()
        self.lam = lambda_strat

    def forward(self, pred, target, valid):
        valid = valid.to(pred.dtype)
        mse = ((pred - target) ** 2 * valid).sum() / valid.sum().clamp_min(1)
        # Temperature should not increase with depth below 30 m
        dt_dz = pred[:, 5:] - pred[:, 4:-1]
        both = valid[:, 5:] * valid[:, 4:-1]
        inversion = (F.relu(dt_dz) * both).sum() / both.sum().clamp_min(1)
        return mse + self.lam * inversion, mse, inversion


def build_model(device='cpu', **kw):
    model = OceanEmbedNet(**kw).to(device)
    n = sum(p.numel() for p in model.parameters())
    print(f"[OceanEmbedNet] {n:,} parameters on {device}")
    return model


if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = build_model(device)
    x = torch.randn(2, 7, 57, 81, device=device)
    lat = torch.linspace(8, 22, 57).view(1, -1, 1).expand(2, -1, 81).to(device)
    lon = torch.linspace(80, 100, 81).view(1, 1, -1).expand(2, 57, -1).to(device)
    doy = torch.tensor([60, 90], device=device)
    y, emb = model(x, lat, lon, doy, return_embedding=True)
    print(f"Output shape: {tuple(y.shape)}  embedding: {tuple(emb.shape)}")
    print("Forward pass OK")

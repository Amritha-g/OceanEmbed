"""
OceanEmbed Deep Learning Model
================================
Architecture: ResNet Encoder (Satellite Embedding) + per-pixel MLP Depth Decoder

Input  X: (B, 7, H, W)  -- 7 surface satellite channels
           sst, sss, sla, u_cur, v_cur, u_wind, v_wind
Output Y: (B, 15, H, W) -- Subsurface temperature at 15 standard depths
           [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000] m
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

STD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

X_MEAN = torch.tensor([28.5, 33.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.5], dtype=torch.float32)
X_STD  = torch.tensor([ 1.5,  0.8, 0.1, 0.2, 0.2, 3.0, 3.0, 0.3, 0.3], dtype=torch.float32)
Y_MEAN = torch.tensor([28.0,27.5,27.0,26.5,26.0,24.5,22.0,19.0,17.0,15.5,13.0,10.5,8.5,7.5,6.8], dtype=torch.float32)
Y_STD  = torch.tensor([ 1.5, 1.5, 1.6, 1.7, 1.8, 2.0, 2.5, 3.0, 3.0, 3.0, 2.5, 2.0,1.5,1.0,0.8], dtype=torch.float32)


class ConvBNReLU(nn.Module):
    def __init__(self, in_c, out_c):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_c, out_c, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
        )
    def forward(self, x):
        return self.block(x)


class ResBlock(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.c1 = ConvBNReLU(ch, ch)
        self.c2 = nn.Sequential(
            nn.Conv2d(ch, ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(ch),
        )
        self.relu = nn.ReLU(inplace=True)
    def forward(self, x):
        return self.relu(self.c2(self.c1(x)) + x)


class DepthDecoder(nn.Module):
    """Per-pixel depth decoder via 1x1 convolutions."""
    def __init__(self, emb_c, out_d=15):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(emb_c, 128, 1), nn.ReLU(inplace=True),
            nn.Conv2d(128, 256, 1),   nn.ReLU(inplace=True),
            nn.Conv2d(256, 128, 1),   nn.ReLU(inplace=True),
            nn.Conv2d(128, out_d, 1),
        )
    def forward(self, x):
        return self.net(x)


class OceanEmbedNet(nn.Module):
    """
    Satellite Embedding Network for Subsurface Ocean Temperature Reconstruction.
    Maps 7 surface satellite fields -> 15-depth temperature water column.
    """
    def __init__(self, in_ch=9, emb_ch=64, out_d=15):
        super().__init__()
        self.register_buffer('x_mean', X_MEAN)
        self.register_buffer('x_std',  X_STD)
        self.register_buffer('y_mean', Y_MEAN)
        self.register_buffer('y_std',  Y_STD)

        self.encoder = nn.Sequential(
            ConvBNReLU(in_ch, 32),
            ResBlock(32),
            ConvBNReLU(32, 64),
            ResBlock(64), ResBlock(64),
            ConvBNReLU(64, emb_ch),
            ResBlock(emb_ch), ResBlock(emb_ch), ResBlock(emb_ch),
        )
        self.decoder = DepthDecoder(emb_ch, out_d)

    def _pos_enc(self, x, lat_grid, doy):
        B, _, H, W = x.shape
        lat_ch = torch.sin(lat_grid * (torch.pi / 90.0)).unsqueeze(1)
        doy_ch = torch.sin(2 * torch.pi * doy.float().view(B,1,1,1) / 365.0).expand(B,1,H,W)
        return torch.cat([x, lat_ch, doy_ch], dim=1)

    def forward(self, x, lat_grid=None, doy=None):
        B, _, H, W = x.shape
        if lat_grid is None:
            lat_grid = torch.zeros(B, H, W, device=x.device)
        if doy is None:
            doy = torch.full((B,), 182, device=x.device)

        x_n = (x - self.x_mean[:7].view(1,-1,1,1)) / (self.x_std[:7].view(1,-1,1,1) + 1e-6)
        x_n = self._pos_enc(x_n, lat_grid, doy)
        emb = self.encoder(x_n)
        y_n = self.decoder(emb)
        return y_n * self.y_mean.view(1,-1,1,1).sqrt() + self.y_mean.view(1,-1,1,1)

    def get_embedding(self, x, lat_grid=None, doy=None):
        B, _, H, W = x.shape
        if lat_grid is None:
            lat_grid = torch.zeros(B, H, W, device=x.device)
        if doy is None:
            doy = torch.full((B,), 182, device=x.device)
        x_n = (x - self.x_mean[:7].view(1,-1,1,1)) / (self.x_std[:7].view(1,-1,1,1) + 1e-6)
        x_n = self._pos_enc(x_n, lat_grid, doy)
        return self.encoder(x_n)


class OceanEmbedLoss(nn.Module):
    """MSE + physics-aware stratification penalty."""
    def __init__(self, lambda_strat=0.05):
        super().__init__()
        self.lam = lambda_strat

    def forward(self, pred, target):
        mse = F.mse_loss(pred, target)
        deep = pred[:, 4:, :, :]
        dt_dz = deep[:, 1:, :, :] - deep[:, :-1, :, :]
        inversion = F.relu(dt_dz).mean()
        return mse + self.lam * inversion, mse, inversion


def build_model(device='cpu'):
    model = OceanEmbedNet().to(device)
    n = sum(p.numel() for p in model.parameters())
    print(f"[OceanEmbedNet] {n:,} parameters on {device}")
    return model


if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = build_model(device)
    x = torch.randn(2, 7, 57, 81, device=device)
    lat = torch.linspace(8, 22, 57).view(1,-1,1).expand(2,-1,81).to(device)
    doy = torch.tensor([60, 90], device=device)
    y = model(x, lat, doy)
    print(f"Output shape: {y.shape}  (expected (2,15,57,81))")
    print(f"Temp range: {y.min().item():.1f} to {y.max().item():.1f} C")
    print("Forward pass OK")

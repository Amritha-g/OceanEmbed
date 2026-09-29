"""Export OceanEmbedNet to ONNX for optional in-browser / ONNX Runtime serving."""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from model.ocean_embed import OceanEmbedNet

ROOT = Path(__file__).resolve().parent.parent
CKPT = ROOT / "model" / "best_model.pt"
OUT = ROOT / "model" / "ocean_embed.onnx"


class ExportNet(torch.nn.Module):
    def __init__(self, net: OceanEmbedNet):
        super().__init__()
        self.net = net

    def forward(self, x, lat_grid, lon_grid, doy, static, present):
        return self.net(x, lat_grid, lon_grid, doy, static, present)


def main():
    ckpt = torch.load(CKPT, map_location="cpu")
    net = OceanEmbedNet(**ckpt.get("model_kwargs", {}))
    net.load_state_dict(ckpt["model_state"])
    net.eval()
    wrapped = ExportNet(net)

    H, W = 57, 81
    x = torch.randn(1, 7, H, W)
    lat = torch.full((1, H, W), 15.0)
    lon = torch.full((1, H, W), 90.0)
    doy = torch.tensor([75.0])
    static = torch.ones(1, 2, H, W)
    present = torch.ones(1, 7, H, W)

    torch.onnx.export(
        wrapped,
        (x, lat, lon, doy, static, present),
        str(OUT),
        input_names=["surface", "lat_grid", "lon_grid", "doy", "static", "present"],
        output_names=["temperature"],
        dynamic_axes={
            "surface": {0: "batch", 2: "H", 3: "W"},
            "lat_grid": {0: "batch", 1: "H", 2: "W"},
            "lon_grid": {0: "batch", 1: "H", 2: "W"},
            "static": {0: "batch", 2: "H", 3: "W"},
            "present": {0: "batch", 2: "H", 3: "W"},
            "doy": {0: "batch"},
            "temperature": {0: "batch", 2: "H", 3: "W"},
        },
        opset_version=17,
    )
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()

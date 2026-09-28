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

    def forward(self, x, lat_grid, doy):
        return self.net(x, lat_grid, doy)


def main():
    ckpt = torch.load(CKPT, map_location="cpu")
    net = OceanEmbedNet()
    net.load_state_dict(ckpt["model_state"])
    net.eval()
    wrapped = ExportNet(net)

    x = torch.randn(1, 7, 1, 1)
    lat = torch.zeros(1, 1, 1)
    doy = torch.tensor([75.0])

    torch.onnx.export(
        wrapped,
        (x, lat, doy),
        str(OUT),
        input_names=["surface", "lat_grid", "doy"],
        output_names=["temperature"],
        dynamic_axes={
            "surface": {0: "batch", 2: "H", 3: "W"},
            "lat_grid": {0: "batch", 1: "H", 2: "W"},
            "doy": {0: "batch"},
            "temperature": {0: "batch", 2: "H", 3: "W"},
        },
        opset_version=17,
    )
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()

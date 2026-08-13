"""BiLSTM and Transformer encoders for landmark-tensor classification."""
from __future__ import annotations

import torch
from torch import nn


class BiLSTMClassifier(nn.Module):
    """2-layer bidirectional LSTM → mean-pool → dense → softmax.

    Input:  (B, T=60, 225)
    Output: (B, num_classes) logits
    """

    def __init__(self, num_classes: int, feat_dim: int = 225, hidden: int = 256, dropout: float = 0.3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=feat_dim,
            hidden_size=hidden,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
            dropout=dropout,
        )
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(
            nn.Linear(hidden * 2, 128),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B, T, 225)
        out, _ = self.lstm(x)         # (B, T, 2*hidden)
        pooled = out.mean(dim=1)      # (B, 2*hidden)
        return self.head(self.dropout(pooled))


class TransformerClassifier(nn.Module):
    """Transformer encoder with a learned CLS token → dense → softmax.

    Input:  (B, T=60, 225)
    Output: (B, num_classes) logits
    """

    def __init__(
        self,
        num_classes: int,
        feat_dim: int = 225,
        d_model: int = 256,
        nhead: int = 4,
        num_layers: int = 4,
        dropout: float = 0.1,
        max_len: int = 61,  # T + 1 for CLS
    ):
        super().__init__()
        self.proj = nn.Linear(feat_dim, d_model)
        self.cls = nn.Parameter(torch.zeros(1, 1, d_model))
        self.pos = nn.Parameter(torch.zeros(1, max_len, d_model))
        nn.init.trunc_normal_(self.cls, std=0.02)
        nn.init.trunc_normal_(self.pos, std=0.02)

        enc_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(enc_layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B, T, 225)
        b, t, _ = x.shape
        z = self.proj(x)                                     # (B, T, d)
        cls = self.cls.expand(b, -1, -1)                     # (B, 1, d)
        z = torch.cat([cls, z], dim=1) + self.pos[:, : t + 1]  # (B, T+1, d)
        z = self.encoder(z)
        return self.head(self.norm(z[:, 0]))                 # CLS token


class CNN1DClassifier(nn.Module):
    """Temporal 1-D CNN baseline (the control model for the BiLSTM comparison).

    Treats the 225-dim landmark vector as channels and time as the spatial axis,
    so each conv kernel sees a fixed-width window of frames. Unlike the BiLSTM it
    has NO recurrent state: it can only see as far back as its receptive field
    (kernel 5, 3 blocks + 2 pools -> ~29 frames of the 60-frame window). That is
    exactly the property we want to measure -- how much does explicit long-range
    temporal modelling actually buy us on isolated ISL signs?

    Input:  (B, T=60, 225)
    Output: (B, num_classes) logits
    """

    def __init__(self, num_classes: int, feat_dim: int = 225, width: int = 256, dropout: float = 0.3):
        super().__init__()

        def block(cin: int, cout: int, pool: bool) -> nn.Sequential:
            layers = [
                nn.Conv1d(cin, cout, kernel_size=5, padding=2),
                nn.BatchNorm1d(cout),
                nn.GELU(),
            ]
            if pool:
                layers.append(nn.MaxPool1d(2))
            return nn.Sequential(*layers)

        self.features = nn.Sequential(
            block(feat_dim, width // 2, pool=True),   # 60 -> 30
            block(width // 2, width, pool=True),      # 30 -> 15
            block(width, width, pool=False),          # 15
        )
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(
            nn.Linear(width * 2, 128),  # avg-pool ++ max-pool concatenated
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B, T, 225)
        z = self.features(x.transpose(1, 2))             # (B, C, T')
        pooled = torch.cat([z.mean(dim=2), z.amax(dim=2)], dim=1)
        return self.head(self.dropout(pooled))


def build(name: str, num_classes: int) -> nn.Module:
    if name == "bilstm":
        return BiLSTMClassifier(num_classes)
    if name == "transformer":
        return TransformerClassifier(num_classes)
    if name == "cnn":
        return CNN1DClassifier(num_classes)
    raise ValueError(f"Unknown model: {name}")


def param_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)

"""T&E: GAN data augmentation, step 1 — train a class-conditional GAN on landmark clips.

Conditional GAN (hinge loss, spectral-norm projection discriminator, 1-D
transposed-conv generator) trained on the standardised TRAINING clips only.
Usage:  python scripts/tne/gan_train.py <seconds>     (default 1500)
Writes logs/tne/gan_generator.pt and logs/tne/gan_train_log.json.
"""
import sys, time, json; sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from common import data, norm, OUT, setup
import numpy as np, torch
import torch.nn as nn, torch.nn.functional as F
from torch.nn.utils import spectral_norm as sn
torch.manual_seed(42); np.random.seed(42)
setup()
_d=data(); Xtr=norm(_d["train"][0]).astype(np.float32); ytr=_d["train"][1]
live=torch.from_numpy(_d["live"].astype(np.float32))
NC=261; ZD=100
class G(nn.Module):
    def __init__(s):
        super().__init__(); s.emb=nn.Embedding(NC,64)
        s.fc=nn.Linear(ZD+64,128*15)
        s.up=nn.Sequential(nn.BatchNorm1d(128),nn.ReLU(),nn.ConvTranspose1d(128,128,4,2,1),nn.BatchNorm1d(128),nn.ReLU(),
            nn.ConvTranspose1d(128,128,4,2,1),nn.BatchNorm1d(128),nn.ReLU(),nn.Conv1d(128,225,3,padding=1))
    def forward(s,z,y):
        h=s.fc(torch.cat([z,s.emb(y)],1)).view(-1,128,15); o=s.up(h)      # B,225,60
        return (o*live[None,:,None]).transpose(1,2)                         # B,60,225
class D(nn.Module):
    def __init__(s):
        super().__init__()
        s.net=nn.Sequential(sn(nn.Conv1d(225,128,4,2,1)),nn.LeakyReLU(.2),sn(nn.Conv1d(128,128,4,2,1)),nn.LeakyReLU(.2),
            sn(nn.Conv1d(128,128,3,1,1)),nn.LeakyReLU(.2))
        s.lin=sn(nn.Linear(128,1)); s.emb=sn(nn.Embedding(NC,128))
    def forward(s,x,y):
        h=s.net(x.transpose(1,2)).sum(2)
        return s.lin(h).squeeze(1)+(s.emb(y)*h).sum(1)
if __name__=="__main__":
    budget=float(sys.argv[1]) if len(sys.argv)>1 else 1500
    g,dd=G(),D(); og=torch.optim.Adam(g.parameters(),2e-4,betas=(.5,.9)); od=torch.optim.Adam(dd.parameters(),2e-4,betas=(.5,.9))
    X=torch.from_numpy(Xtr); Y=torch.from_numpy(ytr); n=len(X); t0=time.time(); step=0; log=[]
    while time.time()-t0<budget:
        idx=torch.randint(0,n,(64,)); xr,yr=X[idx],Y[idx]
        z=torch.randn(64,ZD); yf=torch.randint(0,NC,(64,)); xf=g(z,yf)
        ld=F.relu(1-dd(xr,yr)).mean()+F.relu(1+dd(xf.detach(),yf)).mean()
        od.zero_grad(); ld.backward(); od.step()
        lg=-dd(g(torch.randn(64,ZD),yf),yf).mean()
        og.zero_grad(); lg.backward(); og.step(); step+=1
        if step%200==0:
            log.append((step,round(time.time()-t0),float(ld),float(lg))); print(log[-1],flush=True)
    torch.save(g.state_dict(),OUT/"gan_generator.pt"); json.dump({"steps":step,"seconds":time.time()-t0,"log":log},open(OUT/"gan_train_log.json","w"))

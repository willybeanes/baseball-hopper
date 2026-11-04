"""Savant average-swing reader, copied from SwingPlus/waggle/savant_average_swing_all.ipynb. Usage: read_launch.py out.csv keys..."""
import cv2, numpy as np, os, sys, time, requests, tempfile
BASE='https://builds.mlbstatic.com/baseballsavant.mlb.com/swing-path/splendid-splinter/cut'
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}
def bat_mask(fr):
    r=fr[40:600,280:1010].astype(int);B,G,R=r[...,0],r[...,1],r[...,2]
    return (R>170)&(G>120)&(G<215)&(B>70)&(B<175)&(R-B>45)&(R-G>15)
def read_swing(path):
    cap=cv2.VideoCapture(path);rows=[]
    for i in range(90):
        ok,fr=cap.read()
        if not ok:break
        if i<5 or (i-5)%2 or i>81:continue
        k=(i-5)//2;m=bat_mask(fr);ys,xs=np.nonzero(m)
        if len(xs)<40:rows.append((k,np.nan,len(xs)))
        else:
            pts=np.c_[xs,ys].astype(float);c=pts.mean(0);ev,vec=np.linalg.eigh(np.cov((pts-c).T));d=vec[:,1]
            rows.append((k,float(np.degrees(np.arctan2(-d[1],d[0]))%180),len(xs)))
    return rows
def summarize(rows):
    a=np.array([r[1] for r in rows]);px=np.array([r[2] for r in rows],float)
    if len(a)<39 or np.isnan(a[:3]).any():return None
    i=np.arange(len(a));ok=~np.isnan(a);a=np.interp(i,i[ok],a[ok]);step=np.diff(a);step=(step+90)%180-90
    rot=np.abs(np.concatenate([[0],np.cumsum(step)]))
    j=int(np.argmax(rot>=10)) if (rot>=10).any() else None
    launch=None if j is None or j==0 else (j-1)+(10-rot[j-1])/(rot[j]-rot[j-1])
    return None if launch is None else round(38-float(launch),1)
def one(key):
    r=requests.get(f'{BASE}/{key}.mp4',headers=UA,timeout=180)
    if r.status_code in(403,404):return 'no video',None
    if r.status_code!=200 or len(r.content)<500000:return f'http {r.status_code}',None
    with tempfile.NamedTemporaryFile(suffix='.mp4',delete=False) as f:f.write(r.content);p=f.name
    try:
        s=summarize(read_swing(p))
    finally:os.remove(p)
    return ('ok' if s is not None else 'could not read the bat'),s
if __name__=='__main__':
    out=sys.argv[1];keys=sys.argv[2:]
    if len(keys)==1 and os.path.exists(keys[0]):keys=open(keys[0]).read().split()
    done=set(l.split(',')[0] for l in open(out)) if os.path.exists(out) else set()
    t=time.time();n=0
    for key in keys:
        if key in done:continue
        try:st,v=one(key)
        except Exception as e:print('error',key,str(e)[:80],flush=True);continue
        open(out,'a').write(f"{key},{st},{'' if v is None else v}\n");n+=1
        if n%25==0:print(n,'read',round((time.time()-t)/60,1),'min',flush=True)
        time.sleep(.3)
    print('done',n,flush=True)

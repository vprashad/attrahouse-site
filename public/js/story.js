/* The home page's one motion moment: an orange printed layer by layer, magnets set in, sealed, snapped together,
   then the rest of the Fruit Basket pops up. Scroll position drives it; nothing plays on its own.
   Ported from Design's Orange Story Home version 2 (design/home-v2-2026-11-23.html, approved by Viveg 23 Nov 2026)
   with every one of its 16 changes permanently on and the prototype's switches removed. */
(function(){
  var cv=document.getElementById('cv'); if(!cv) return;
  var ctx=cv.getContext('2d'),story=document.querySelector('.story');
  var hdr=document.querySelector('header.site');
  function setHH(){ if(hdr) document.documentElement.style.setProperty('--hh', hdr.offsetHeight+'px'); }
  setHH();
  var W=0,H=0,dpr=1,K=0.34,N=30,M=6,GA=1; // view squash, layers per half, magnet layer
  var C={side:'#EE8A3C',shade:'#D46F28',top:'#F5A45E',fresh:'#FBC07F',line:'rgba(43,38,36,.16)',pith:'#FBEFD9',flesh:'#F39A4A',seg:'#E07A2E',
         mag:'#D9DDE1',magRim:'#8E959C',pocket:'#B2581D',leaf:'#5C9A47',stem:'#8A5A2B'};
  function size(){setHH();dpr=Math.min(window.devicePixelRatio||1,2);var r=cv.getBoundingClientRect();W=r.width;H=r.height;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);draw();}
  function cl(x){return x<0?0:x>1?1:x}
  function seg(p,a,b){return cl((p-a)/(b-a))}
  function eio(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2}
  function ein(t){return t*t*t}
  var chaps=story.querySelectorAll('.chap');
  function hh(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh'))||64;}
  function scrolled(){var r=story.getBoundingClientRect();var top=hh();var h=H||window.innerHeight,s=top-r.top;
    if(s<=0)return 0;var n=chaps.length-1,last=chaps[n].offsetTop;
    if(s>=last)return Math.min(n+(story.offsetHeight-h-last)/h,n+(s-last)/h);
    for(var i=0;i<n;i++){var a=chaps[i].offsetTop,b=chaps[i+1].offsetTop;if(s<b)return i+(s-a)/(b-a);}
    return n;}
  var RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var steps=document.querySelectorAll('.steps li:not(.sk)');
  document.querySelectorAll('.steps button').forEach(function(b){b.addEventListener('click',function(){var c=chaps[+b.dataset.go];
    window.scrollTo({top:story.getBoundingClientRect().top+window.scrollY+c.offsetTop-hh()+(+b.dataset.go===5?(H||innerHeight)*0.55:0)+2,behavior:RM?'auto':'smooth'});});});
  var pull={m:0,t:0,b:0},pb=document.getElementById('pull');
  if(pb)pb.addEventListener('click',function(){pull.t=pull.t?0:1;pb.setAttribute('aria-pressed',pull.t?'true':'false');pb.textContent=pull.t?'Click it back':'Pull it apart';
    (function an(){var d=pull.t-pull.m;if(Math.abs(d)<0.02){pull.m=pull.t;if(!pull.t&&!RM){pull.b=1;(function bb(){pull.b-=0.06;draw();if(pull.b>0)requestAnimationFrame(bb);else{pull.b=0;draw();}})();}draw();return;}
      pull.m+=d*(RM?1:(pull.t?0.16:0.3));draw();requestAnimationFrame(an);})();});
  function progress(){return Math.min(1,scrolled()/5);}

  function geo(){
    var wide=W>=900, R, cx, cy;
    if(wide){R=Math.min(W*0.5/5.4,H/4.0);cx=W*0.70-(W>=1280?70:0);cy=H*0.5;}
    else{var ah=H*0.46;R=Math.min(W/6.0,ah/4.0);cx=W/2;cy=ah*0.54+8;}
    return {R:R,cx:cx,cy:cy,by:cy+0.7*R};
  }
  function rad(R,i){var h=(i+0.5)/N*R;return Math.sqrt(Math.max(0,R*R-h*h));}

  // one half on the bed, built layer by layer
  function layered(x,by,R,done,frac,mags,pockets){
    var t=R/N, full=Math.floor(done);
    for(var i=0;i<=Math.min(full,N-1);i++){
      var partial=(i===full);if(partial&&frac<=0)break;
      var r=rad(R,i),yb=by-i*t,yt=by-(i+1)*t;
      ctx.globalAlpha=GA*(partial?Math.max(.25,frac):1);
      ctx.fillStyle=C.side;ctx.beginPath();ctx.ellipse(x,yb,r,r*K,0,0,Math.PI);ctx.lineTo(x-r,yt);ctx.ellipse(x,yt,r,r*K,0,Math.PI,0,true);ctx.closePath();ctx.fill();
      ctx.save();ctx.clip();ctx.fillStyle=C.shade;ctx.fillRect(x+r*0.42,yt-r*K,r,t+2*r*K);ctx.restore();
      ctx.strokeStyle=C.line;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,yb,r,r*K,0,0.08,Math.PI-0.08);ctx.stroke();
      ctx.fillStyle=(i>=full-1)?C.fresh:C.top;ctx.beginPath();ctx.ellipse(x,yt,r,r*K,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=GA;
      if(partial&&frac<1){ // a glowing line of colour traces the new layer
        var a0=Math.PI*0.5,ha=a0+Math.PI*2*frac;
        ctx.strokeStyle='#FFF1D6';ctx.lineWidth=Math.max(2,R*0.035);ctx.lineCap='round';
        ctx.beginPath();ctx.ellipse(x,yt,r,r*K,0,a0,ha);ctx.stroke();
        spark(x+Math.cos(ha)*r,yt+Math.sin(ha)*r*K,R,frac);
      }
      if(i===M-1&&pockets){
        var pts=[[-0.48,0.15],[0.48,0.15],[0,-0.42]],mr=0.19*R;
        pts.forEach(function(q,j){
          var px=x+q[0]*r,py=yt+q[1]*r*K;
          ctx.fillStyle=C.pocket;ctx.beginPath();ctx.ellipse(px,py,mr,mr*K,0,0,Math.PI*2);ctx.fill();
          var m=mags[j];
          if(m>0.15&&m<1){ // the pull: field lines reach up from the pocket
            ctx.strokeStyle='rgba(205,212,218,'+(0.75*m)+')';ctx.lineWidth=1.5;ctx.setLineDash([3,4]);
            for(var f2=1;f2<=3;f2++){var rr=mr*(0.8+f2*0.55*(1.25-m));ctx.beginPath();ctx.ellipse(px,py,rr,rr*1.3,0,Math.PI*1.08,Math.PI*1.92);ctx.stroke();}
            ctx.setLineDash([]);
          }
          if(m>0){
            var dy=-(1-m)*(1-m)*2.6*R, sp=m<1?Math.abs(Math.sin((1-m)*Math.PI*3)):0, ry=mr*0.92*(K+(1-K)*sp);
            ctx.fillStyle=C.magRim;ctx.beginPath();ctx.ellipse(px,py+dy+Math.max(2,R*0.03)*(1-sp),mr*0.92,ry,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle=C.mag;ctx.beginPath();ctx.ellipse(px,py+dy,mr*0.92,ry,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='rgba(255,255,255,.7)';ctx.beginPath();ctx.ellipse(px-mr*0.3,py+dy-ry*0.25,mr*0.25,ry*0.22,0,0,Math.PI*2);ctx.fill();
            var ck=mags.click[j];
            if(m>=1&&ck>0){ // click: a ripple runs out across the surface
              ctx.strokeStyle='rgba(255,241,214,'+(0.9*ck)+')';ctx.lineWidth=2;
              ctx.beginPath();ctx.ellipse(px,py,mr*(1.1+1.8*(1-ck)),mr*(1.1+1.8*(1-ck))*K,0,0,Math.PI*2);ctx.stroke();
            }
          }
        });
      }
    }
  }
  function spark(x,y,R,seed){if(RM)return;
    ctx.fillStyle='rgba(255,200,120,.30)';ctx.beginPath();ctx.arc(x,y,R*0.11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,236,200,.85)';ctx.beginPath();ctx.arc(x,y,R*0.045,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.arc(x,y,R*0.02,0,Math.PI*2);ctx.fill();
    for(var k=0;k<4;k++){var a=seed*40+k*1.7,d=R*(0.14+0.1*((k*7+Math.floor(seed*30))%3));
      ctx.fillStyle='rgba(255,214,150,'+(0.9-k*0.18)+')';ctx.beginPath();ctx.arc(x+Math.cos(a)*d,y+Math.sin(a)*d*0.6-R*0.05,R*0.014,0,Math.PI*2);ctx.fill();}
  }
  // smooth finished half, base centre at 0,0, dome up
  function dome(R,face){
    ctx.beginPath();ctx.ellipse(0,0,R,R*K,0,0,Math.PI);ctx.arc(0,0,R,Math.PI,Math.PI*2);ctx.closePath();
    ctx.fillStyle=C.side;ctx.fill();
    ctx.save();ctx.clip();
    ctx.fillStyle=C.shade;ctx.beginPath();ctx.rect(-R*2,-R*2,R*4,R*4);ctx.arc(-R*0.2,-R*0.08,R*1.0,0,Math.PI*2,true);ctx.fill();
    ctx.fillStyle='#F7B06E';ctx.beginPath();ctx.ellipse(-R*0.42,-R*0.55,R*0.2,R*0.11,-0.6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(180,90,30,.35)';[[-.2,-.3],[.3,-.6],[.1,-.15],[-.55,-.2],[.45,-.25],[-.05,-.75]].forEach(function(d){ctx.beginPath();ctx.arc(d[0]*R,d[1]*R,R*0.022,0,Math.PI*2);ctx.fill();});
    ctx.restore();
    if(face>0){ // the cut face, colour printed in
      ctx.globalAlpha=face;
      ctx.fillStyle=C.pith;ctx.beginPath();ctx.ellipse(0,0,R,R*K,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=C.flesh;ctx.beginPath();ctx.ellipse(0,0,R*0.86,R*0.86*K,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=C.pith;ctx.lineWidth=Math.max(1.5,R*0.03);ctx.beginPath();
      for(var s=0;s<10;s++){var a=s/10*Math.PI*2;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*R*0.86,Math.sin(a)*R*0.86*K);}ctx.stroke();
      ctx.globalAlpha=1;
    }
  }
  function whole(cx,cy,R,s,leaf,shadowY){
    ctx.fillStyle='rgba(43,38,36,.12)';ctx.beginPath();ctx.ellipse(cx,shadowY,R*0.9,R*0.16,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(cx,cy);ctx.scale(s,s);
    ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.fillStyle=C.side;ctx.fill();
    ctx.save();ctx.clip();
    ctx.fillStyle=C.shade;ctx.beginPath();ctx.rect(-R*2,-R*2,R*4,R*4);ctx.arc(-R*0.18,-R*0.12,R*1.0,0,Math.PI*2,true);ctx.fill();
    ctx.fillStyle='#F7B06E';ctx.beginPath();ctx.ellipse(-R*0.42,-R*0.45,R*0.22,R*0.13,-0.6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(180,90,30,.35)';[[-.2,-.3],[.3,-.6],[.1,.15],[-.55,.2],[.45,.35],[-.05,-.75],[.2,.6],[-.4,.55]].forEach(function(d){ctx.beginPath();ctx.arc(d[0]*R,d[1]*R,R*0.022,0,Math.PI*2);ctx.fill();});
    ctx.strokeStyle='rgba(120,55,15,.35)';ctx.lineWidth=Math.max(1,R*0.02);ctx.beginPath();ctx.moveTo(0,-R);ctx.lineTo(0,R);ctx.stroke();
    ctx.restore();
    if(leaf>0){
      ctx.fillStyle=C.stem;ctx.fillRect(-R*0.04,-R*1.08,R*0.08,R*0.14*leaf+0.01);
      ctx.save();ctx.translate(R*0.02,-R*1.02);ctx.rotate(-0.5);ctx.scale(leaf,leaf);
      ctx.fillStyle=C.leaf;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(R*0.28,-R*0.2,R*0.55,0);ctx.quadraticCurveTo(R*0.28,R*0.12,0,0);ctx.fill();ctx.restore();
    }
    ctx.restore();
  }

  function draw(){
    var uu=scrolled();steps.forEach(function(li,i){var n=i+1;li.classList.toggle('on',Math.round(Math.min(5,uu))===n);li.classList.toggle('done',uu>n+0.5);});
    var p=progress(),g=geo(),R=g.R,cx=g.cx,by=g.by;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    var xa=cx-1.25*R,xb=cx+1.25*R;
    var pr1=seg(p,0.08,0.30), mg=seg(p,0.32,0.47), pr2=seg(p,0.49,0.64), lift=seg(p,0.655,0.71), rot=seg(p,0.71,0.765), join=seg(p,0.765,0.805), leaf=seg(p,0.83,0.875);
    var layers = pr2>0 ? M+pr2*(N-M) : pr1*M;
    var t=R/N;
    function shadow(x,y,sc,a){ctx.fillStyle='rgba(43,38,36,'+a+')';ctx.beginPath();ctx.ellipse(x,y,R*1.08*sc,R*0.2*sc,0,0,Math.PI*2);ctx.fill();}
    function ghost(x,a){ // the shape to come, as layer outlines
      ctx.strokeStyle='rgba(184,119,63,'+a+')';ctx.lineWidth=1;
      for(var i=0;i<N;i+=3){var r=rad(R,i);ctx.beginPath();ctx.ellipse(x,by-(i+1)*t,r,r*K,0,0,Math.PI*2);ctx.stroke();}
      ctx.beginPath();ctx.arc(x,by,R,Math.PI,Math.PI*2);ctx.stroke();
    }
    if(lift<=0){
      var mags=function(h){var a=[],c=[];for(var j=0;j<3;j++){var t0=(j+3*h)*0.11,tt=seg(mg,t0,t0+0.2);a.push(tt<1?ein(tt):1);c.push(tt>=1?cl(1-(mg-(t0+0.2))/0.14):0);}a.click=c;return a;};
      var whole_=Math.floor(layers),f=layers-whole_;
      if(layers>=N)f=0;
      var hs=seg(p,0.0,0.07);
      shadow(xa,by+R*0.16,1,0.12*hs);shadow(xb,by+R*0.16,1,0.12*hs);
      if(hs<1){ctx.save();ctx.globalAlpha=1-hs;whole(cx,g.cy-0.1*R,R*(1.5-0.5*hs),1,1,g.cy-0.1*R+R*(1.5-0.5*hs)*1.12);ctx.restore();ctx.globalAlpha=1;}
      var ga=p<0.08?0.55*hs:(layers<N?0.28:0);
      if(ga>0){ghost(xa,ga);ghost(xb,ga);}
      layered(xa,by,R,whole_,f,mags(0),pr1>=1);
      layered(xb,by,R,whole_,f,mags(1),pr1>=1);
      var sh=pr2>0?1-seg(pr2,0,0.22):0;
      if(sh>0){ // the magnets glint through as they are covered
        var ti=Math.min(N-1,whole_),rr=rad(R,ti),yy=by-(ti+1)*t,mr=0.19*R;
        [xa,xb].forEach(function(x){[[-0.48,0.15],[0.48,0.15],[0,-0.42]].forEach(function(q){
          ctx.fillStyle='rgba(235,240,244,'+(0.6*sh)+')';ctx.beginPath();ctx.ellipse(x+q[0]*rr,yy+q[1]*rr*K,mr,mr*K,0,0,Math.PI*2);ctx.fill();});});
      }
      var xr=seg(pr2,0.55,0.8);
      if(xr>0){ // see-through: the magnets, sealed inside
        var my=by-M*t+(t*0.5),r2=rad(R,M-1),mr2=0.19*R;
        ctx.setLineDash([4,4]);ctx.lineWidth=2;ctx.strokeStyle='rgba(255,255,255,'+(0.9*xr)+')';ctx.fillStyle='rgba(217,221,225,'+(0.35*xr)+')';
        [xa,xb].forEach(function(x){[[-0.48,0.15],[0.48,0.15],[0,-0.42]].forEach(function(q){ctx.beginPath();ctx.ellipse(x+q[0]*r2,my+q[1]*r2*K,mr2,mr2*K,0,0,Math.PI*2);ctx.fill();ctx.stroke();});});
        ctx.setLineDash([]);
      }
      return;
    }
    // lift, finish, turn, snap
    var e=eio(lift), cy=g.cy;
    var ya=by+(cy-by)*e - Math.sin(e*Math.PI)*0.35*R;
    var ang=eio(rot)*Math.PI/2;
    var gap=1.25*R*(1-ein(join));
    if(join<1){
      [-1,1].forEach(function(side){
        var x0=cx+side*gap;
        shadow(x0,by+R*0.16+(cy-by)*e*0.2,1-0.35*e,0.12*(1-0.5*e));
        if(lift<1){GA=1-e;layered(x0,ya,R,N,0,[0,0,0],false);GA=1;}
        ctx.save();ctx.translate(x0,ya);ctx.rotate(side*ang);
        ctx.globalAlpha=lift<1?e:1;
        dome(R, Math.min(1,rot*1.5)*(1-ein(join)));
        ctx.restore();ctx.globalAlpha=1;
      });
      if(join>0.2&&gap>R*K*1.3){ // the pull between the two faces
        ctx.strokeStyle='rgba(184,119,63,'+(0.7*join)+')';ctx.lineWidth=2;ctx.setLineDash([4,5]);
        [-0.55,-0.2,0.2,0.55].forEach(function(o){ctx.beginPath();ctx.moveTo(cx-gap+R*K,ya+o*R);ctx.quadraticCurveTo(cx,ya+o*R*(1.6-join*0.6),cx+gap-R*K,ya+o*R);ctx.stroke();});
        ctx.setLineDash([]);
      }
    }else{
      var after=seg(p,0.805,0.86), sc=1+0.06*Math.sin(Math.min(1,after*2.2)*Math.PI);
      if(after<1&&!RM){ // snap: a ring and a burst of citrus drops
        var ea=eio(after);
        ctx.strokeStyle='rgba(238,138,60,'+(0.55*(1-after))+')';ctx.lineWidth=Math.max(2,R*0.04);
        ctx.beginPath();ctx.arc(cx,ya,R*(1.05+0.75*ea),0,Math.PI*2);ctx.stroke();
        for(var k=0;k<16;k++){var an=k/16*Math.PI*2+0.3,d=R*(1.1+(1.1+0.35*(k%3))*ea);
          ctx.fillStyle=(k%3===0?'rgba(243,198,74,':'rgba(238,138,60,')+(1-after)+')';
          ctx.beginPath();ctx.ellipse(cx+Math.cos(an)*d,ya+Math.sin(an)*d+ea*ea*R*0.5,R*(0.07-0.035*after)*(k%2?1:0.65),R*(0.05-0.025*after)*(k%2?1:0.65),an,0,Math.PI*2);ctx.fill();}
      }
      var u=scrolled(),shrink=1-0.2*eio(seg(u,4.55,4.8)),os=sc*shrink;
      var F=fruits(u);
      F.forEach(function(f){if(f.y<0)drawFruit(f,cx,ya,R);});
      var pm=u>4.4?pull.m:0;
      if(pm>0.01){
        ctx.fillStyle='rgba(43,38,36,.12)';ctx.beginPath();ctx.ellipse(cx,ya+R*os*1.12,R*os*(0.9+0.6*pm),R*os*0.16,0,0,Math.PI*2);ctx.fill();
        [-1,1].forEach(function(sd){ctx.save();ctx.translate(cx+sd*pm*0.62*R*os,ya);ctx.rotate(sd*Math.PI/2);dome(R*os,Math.min(1,pm*2.5));ctx.restore();});
      }else whole(cx,ya,R*os,1,eio(leaf),ya+R*os*1.12);
      if(pull.b>0){ctx.strokeStyle='rgba(238,138,60,'+(0.6*pull.b)+')';ctx.lineWidth=Math.max(2,R*0.04);ctx.beginPath();ctx.arc(cx,ya,R*os*(1.05+0.6*(1-pull.b)),0,Math.PI*2);ctx.stroke();}
      F.forEach(function(f){if(f.y>=0)drawFruit(f,cx,ya,R);});
    }
  }
  // the rest of the Fruit Basket pops up, one by one (two arrangements: 900 px and wider, and below)
  function back(t){var c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);}
  var SET2=[['watermelon',-1.45,-1.45,1.9,0.44],['apple',0.45,-1.75,1.05,0.42],['pear',1.65,-1.3,1.15,0.52],['avocado',1.95,0.15,1.1,0.52],['lemon',-1.9,0.2,0.95,0.36],['kiwi',-1.3,1.35,0.75,0.42],['banana',0.1,1.55,1.5,0.2],['lime',1.2,1.15,0.7,0.4],['strawberry',1.9,1.45,0.6,0.42]];
  var SET3=[['watermelon',-1.75,-0.9,1.7,0.44],['apple',1.35,-1.02,1.0,0.42],['pear',2.4,-0.85,1.1,0.52],['avocado',2.2,0.45,1.05,0.52],['lemon',-2.05,0.6,0.95,0.36],['kiwi',-1.25,1.4,0.75,0.42],['banana',0.1,1.55,1.5,0.2],['lime',1.35,1.15,0.7,0.4],['strawberry',2.3,1.5,0.6,0.42]];
  function fruits(u){return (W>=900?SET2:SET3).map(function(f,i){var a=4.8+i*0.07,t=seg(u,a,a+0.2);return {k:f[0],x:f[1],y:f[2],m:f[3]||1,b:f[4]||0,t:t};});}
  function drawFruit(f,cx,cy,R){
    if(f.t<=0)return;
    var x=cx+f.x*R,y=cy+f.y*R,s=back(f.t)*R*f.m;
    ctx.fillStyle='rgba(43,38,36,.10)';ctx.beginPath();if(f.b)ctx.ellipse(x,y+s*(f.b+0.03),s*0.42,s*0.07,0,0,Math.PI*2);else ctx.ellipse(x,y+s*0.55,s*0.5,s*0.1,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.lineWidth=0.04;
    function sh(path){ctx.save();path();ctx.clip();ctx.fillStyle='rgba(60,25,10,.18)';ctx.beginPath();ctx.rect(-2,-2,4,4);ctx.arc(-0.1,-0.08,0.62,0,Math.PI*2,true);ctx.fill();ctx.fillStyle='rgba(255,255,255,.28)';ctx.beginPath();ctx.ellipse(-0.2,-0.25,0.1,0.06,-0.6,0,Math.PI*2);ctx.fill();ctx.restore();}
    var k=f.k;
    if(k==='apple'){var ap=function(){ctx.beginPath();ctx.arc(-0.14,0,0.42,0,Math.PI*2);ctx.arc(0.14,0,0.42,0,Math.PI*2);};ctx.fillStyle='#C9382E';ap();ctx.fill();sh(ap);
      ctx.strokeStyle='#8A5A2B';ctx.lineWidth=0.06;ctx.beginPath();ctx.moveTo(0,-0.32);ctx.lineTo(0.05,-0.55);ctx.stroke();ctx.fillStyle='#5C9A47';ctx.beginPath();ctx.ellipse(0.17,-0.5,0.14,0.06,-0.4,0,Math.PI*2);ctx.fill();}
    else if(k==='pear'){var pp=function(){ctx.beginPath();ctx.arc(0,0.12,0.4,0,Math.PI*2);ctx.arc(0,-0.25,0.24,0,Math.PI*2);};ctx.fillStyle='#B9C64B';pp();ctx.fill();sh(pp);
      ctx.strokeStyle='#8A5A2B';ctx.lineWidth=0.05;ctx.beginPath();ctx.moveTo(0,-0.45);ctx.lineTo(0.06,-0.62);ctx.stroke();}
    else if(k==='lemon'){var lp=function(){ctx.beginPath();ctx.ellipse(0,0,0.5,0.36,0,0,Math.PI*2);ctx.ellipse(-0.5,0,0.08,0.06,0,0,Math.PI*2);ctx.ellipse(0.5,0,0.08,0.06,0,0,Math.PI*2);};ctx.fillStyle='#F3C64A';lp();ctx.fill();sh(lp);}
    else if(k==='banana'){var bp=function(){ctx.beginPath();ctx.moveTo(-0.52,-0.12);ctx.quadraticCurveTo(0,0.5,0.52,-0.18);ctx.quadraticCurveTo(0.02,0.0,-0.52,-0.12);};ctx.fillStyle='#F3C64A';bp();ctx.fill();
      ctx.fillStyle='#8A5A2B';ctx.beginPath();ctx.arc(-0.52,-0.12,0.04,0,Math.PI*2);ctx.arc(0.52,-0.18,0.035,0,Math.PI*2);ctx.fill();}
    else if(k==='lime'){var mp=function(){ctx.beginPath();ctx.arc(0,0,0.4,0,Math.PI*2);};ctx.fillStyle='#7FAE45';mp();ctx.fill();sh(mp);}
    else if(k==='kiwi'){ctx.fillStyle='#8A5A2B';ctx.beginPath();ctx.arc(0,0,0.42,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9CC24B';ctx.beginPath();ctx.arc(0,0,0.36,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#EEF2C8';ctx.beginPath();ctx.arc(0,0,0.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2B2624';for(var i=0;i<12;i++){var a=i/12*Math.PI*2;ctx.beginPath();ctx.ellipse(Math.cos(a)*0.19,Math.sin(a)*0.19,0.03,0.015,a,0,Math.PI*2);ctx.fill();}}
    else if(k==='strawberry'){var stp=function(){ctx.beginPath();ctx.moveTo(0,0.42);ctx.bezierCurveTo(-0.5,0.1,-0.45,-0.32,0,-0.28);ctx.bezierCurveTo(0.45,-0.32,0.5,0.1,0,0.42);};ctx.fillStyle='#E5544A';stp();ctx.fill();sh(stp);
      ctx.fillStyle='#F3C64A';[[-0.15,-0.05],[0.12,-0.08],[0,0.12],[-0.2,0.15],[0.18,0.12],[0,-0.15]].forEach(function(d){ctx.beginPath();ctx.ellipse(d[0],d[1],0.025,0.035,0,0,Math.PI*2);ctx.fill();});
      ctx.fillStyle='#5C9A47';ctx.beginPath();ctx.moveTo(-0.25,-0.28);ctx.lineTo(0,-0.42);ctx.lineTo(0.25,-0.28);ctx.lineTo(0,-0.22);ctx.closePath();ctx.fill();}
    else if(k==='avocado'){ctx.fillStyle='#3E6B2E';ctx.beginPath();ctx.arc(0,0.12,0.4,0,Math.PI*2);ctx.arc(0,-0.22,0.26,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#CFE08F';ctx.beginPath();ctx.arc(0,0.12,0.33,0,Math.PI*2);ctx.arc(0,-0.22,0.19,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8A5A2B';ctx.beginPath();ctx.arc(0,0.1,0.17,0,Math.PI*2);ctx.fill();}
    else if(k==='watermelon'){var wp=function(){ctx.beginPath();ctx.ellipse(0,0,0.62,0.44,0,0,Math.PI*2);};ctx.fillStyle='#5C9A47';wp();ctx.fill();
      ctx.save();wp();ctx.clip();ctx.strokeStyle='#2F5E28';ctx.lineWidth=0.07;[-0.7,-0.35,0,0.35,0.7].forEach(function(q){ctx.beginPath();ctx.moveTo(-0.62,0);ctx.quadraticCurveTo(0,q*0.9,0.62,0);ctx.stroke();});ctx.restore();sh(wp);}
    ctx.restore();
    if(f.t<1){var a2=1-f.t;ctx.strokeStyle='rgba(238,138,60,'+(0.6*a2)+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,R*f.m*(0.5+0.5*f.t),0,Math.PI*2);ctx.stroke();}
  }
  var raf=0;function req(){if(!raf)raf=requestAnimationFrame(function(){raf=0;draw();});}
  window.addEventListener('scroll',req,{passive:true});window.addEventListener('resize',size);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(size);
  size();
})();

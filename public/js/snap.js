/* Magnetic snap animations. Pieces drift with the scroll, then the magnet takes over and snaps them shut. */
(function(){
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  var cl=function(x){return x<0?0:x>1?1:x;}, REACH=.42;
  var F=[].map.call(document.querySelectorAll('.fruit'),function(el){
    var n=+el.dataset.n, T=el.dataset.t?JSON.parse(el.dataset.t):null, J=[];
    for(var k=0;k<n;k++){ var t=T?T[k]:(k+1)/(n+1); J.push({t:t, s:(k?(T?T[k-1]:k/(n+1)):0)+.03, snapped:false, val:0, tw:null, at:0}); }
    return {el:el, J:J, sq:JSON.parse(el.dataset.sq), force:null, pin:!!el.dataset.pin, tap:el.closest('.tapstage'),
      marks:el.dataset.marks?[].slice.call(document.querySelectorAll(el.dataset.marks)):[],
      sparks:[].slice.call(el.querySelectorAll('.spark')),
      pieces:[].map.call(el.querySelectorAll('.piece'),function(p){return {el:p,m:JSON.parse(p.dataset.m)};}),
      faces:[].map.call(el.querySelectorAll('.face'),function(f){return {el:f,cx:+f.dataset.cx,k:+f.dataset.k,j:+f.dataset.f};})};
  });
  var sec=document.getElementById('snap'), cue=document.getElementById('snap-cue'), bbar=document.querySelector('.bbar');
  function progress(f){
    if(f.tap) return 1;                                   // tap-only fruit rests whole
    if(f.pin){ var st=sec.querySelector('.stage'), span=sec.offsetHeight-st.offsetHeight, pin=parseFloat(getComputedStyle(st).top)||0;
      return span>0?cl((pin-sec.getBoundingClientRect().top)/span):1; }
    var r=f.el.getBoundingClientRect(), vh=window.innerHeight; return cl((vh*.98-(r.top+r.height*.45))/(vh*.42));
  }
  function draw(f){
    var u=f.el.clientWidth/600; if(!u) return;
    f.pieces.forEach(function(p){ var x=0,y=0,r=0; p.m.forEach(function(m){ var w=1-f.J[m[0]].val; x+=m[1]*w; y+=m[2]*w; r+=m[3]*w*w; });
      p.el.style.transform='translate3d('+(x*u).toFixed(2)+'px,'+(y*u).toFixed(2)+'px,0) rotate('+r.toFixed(2)+'deg)'; });
    f.faces.forEach(function(c){ var s=(1-f.J[c.j].val)*c.k;
      c.el.setAttribute('transform','translate('+c.cx+' 0) scale('+s.toFixed(4)+' 1) translate('+(-c.cx)+' 0)'); c.el.style.opacity=s<.004?0:1; });
    var n=f.J.length; f.marks.forEach(function(li,i){ var j=f.J[Math.min(i,n-1)]; li.classList.toggle('on', j.snapped && (i<n || (!j.tw&&j.val>.999))); });
  }
  function hit(f,k){ var e=f.el; e.style.setProperty('--sx',f.sq[k][0]); e.style.setProperty('--sy',f.sq[k][1]); e.classList.remove('hit'); void e.offsetWidth; e.classList.add('hit');
    if(f.sparks[k]){ f.sparks[k].classList.remove('go'); void e.offsetWidth; f.sparks[k].classList.add('go'); }
  }
  var raf=0;
  function frame(now){
    raf=0; var busy=false;
    F.forEach(function(f){
      if(!f.el.offsetParent) return;                       // its page is not showing
      var p=f.force==='apart'?0:f.force==='whole'?1:progress(f), n=f.J.length;
      f.J.forEach(function(j,k){
        var want;
        if(j.snapped) want = p>j.t-.08 || (k<n-1 && f.J[k+1].snapped);
        else { want = p>=j.t; if(want && k>0){ var b=f.J[k-1]; if(!b.snapped||b.tw||now-b.at<110){ want=false; busy=true; } } }
        if(want!==j.snapped){ j.tw={from:j.val,t0:now,dur:want?120:300,snap:want}; j.snapped=want; }
        var d=cl((p-j.s)/(j.t-j.s)), target=j.snapped?1:REACH*d*d*d;
        if(j.tw){ var t=cl((now-j.tw.t0)/j.tw.dur), c=1.9, e=j.tw.snap? t*t*t*t : 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);
          j.val=j.tw.from+(target-j.tw.from)*e;
          if(t>=1){ j.val=target; if(j.tw.snap){ j.at=now; hit(f,k); } j.tw=null; } else busy=true;
        } else j.val=target;
      });
      draw(f);
      if(f.pin && cue) cue.classList.toggle('off',p>.03);
    });
    if(bbar){ var vis=[].some.call(document.querySelectorAll('form.wl'),function(fm){ if(!fm.offsetParent) return false; var r=fm.getBoundingClientRect(); return r.top<window.innerHeight*.85 && r.bottom>60; }); bbar.classList.toggle('off',vis); }
    if(busy) ask();
  }
  function ask(){ if(!raf) raf=requestAnimationFrame(frame); }
  function still(f,apart){ f.J.forEach(function(j){j.snapped=!apart;j.val=apart?0:1;j.tw=null;}); draw(f); }
  F.forEach(function(f){ if(!f.tap) return;
    f.tap.addEventListener('click',function(){ var whole=f.J.every(function(j){return j.snapped;});
      f.force=whole?'apart':'whole'; f.tap.setAttribute('aria-pressed',whole); if(reduce.matches) still(f,whole); else ask(); }); });
  function mode(){ if(reduce.matches){ window.removeEventListener('scroll',ask); F.forEach(function(f){still(f,false);}); } else { window.addEventListener('scroll',ask,{passive:true}); ask(); } }
  window.addEventListener('resize',function(){ reduce.matches? F.forEach(draw) : ask(); });
  if(reduce.addEventListener) reduce.addEventListener('change',mode);

  mode();
})();

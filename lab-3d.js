(() => {
  const mountStage = stage => {
    if (!stage || stage.dataset.lab3dMounted) return;
    stage.dataset.lab3dMounted = 'true';
    stage.classList.add('lab3d-stage');
    stage.setAttribute('aria-label', 'Интерактивная 3D-сцена колбы. Потяни мышью или пальцем, чтобы изменить ракурс.');
    stage.insertAdjacentHTML('afterbegin', `<div class="lab3d-room" aria-hidden="true"><i class="lab3d-grid"></i><i class="lab3d-monitor left"></i><i class="lab3d-monitor right"></i><i class="lab3d-light key"></i><i class="lab3d-light rim"></i><i class="lab3d-bench-surface"></i></div><div class="lab3d-orbit-hint" aria-hidden="true"><span>↔</span> ПОТЯНИ ДЛЯ ОБЗОРА</div>`);
    let dragging = false, startX = 0, startY = 0, rotateX = 0, rotateY = 0;
    const setRotation = () => {
      stage.style.setProperty('--scene-x', `${rotateX}deg`);
      stage.style.setProperty('--scene-y', `${rotateY}deg`);
    };
    const point = event => event.touches ? event.touches[0] : event;
    const start = event => { const p = point(event); dragging = true; startX = p.clientX; startY = p.clientY; stage.classList.add('is-orbiting'); };
    const move = event => { if (!dragging) return; const p = point(event); rotateY = Math.max(-12, Math.min(12, (p.clientX - startX) / 12)); rotateX = Math.max(-7, Math.min(7, -(p.clientY - startY) / 15)); setRotation(); };
    const stop = () => { if (!dragging) return; dragging = false; stage.classList.remove('is-orbiting'); };
    stage.addEventListener('pointerdown', start);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);
    stage.addEventListener('pointerleave', stop);
    stage.addEventListener('touchstart', start, { passive:true });
    stage.addEventListener('touchmove', move, { passive:true });
    stage.addEventListener('touchend', stop, { passive:true });
    setRotation();
  };
  const mountAll = () => document.querySelectorAll('.flask-stage').forEach(mountStage);
  new MutationObserver(mountAll).observe(document.getElementById('view'), { childList:true, subtree:true });
  mountAll();
})();

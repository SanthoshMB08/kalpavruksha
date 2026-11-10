(() => {
  let activeOverlay, previousFocus, profileRequest, requestId = 0;
  const focusable = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]';
  function visibleControls(root) { return [...root.querySelectorAll(focusable)].filter(el=>el.getClientRects().length); }
  function open(overlay) {
    if (!overlay) return;
    previousFocus = document.activeElement;
    activeOverlay = overlay;
    overlay.classList.add('open');
    const box = overlay.querySelector('.modal-box') || overlay;
    box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    box.setAttribute('aria-label',window.t('Details')); box.tabIndex=-1;
    document.body.classList.add('dialog-open');
    (visibleControls(box)[0] || box).focus();
  }
  function close() {
    if (!activeOverlay) return;
    profileRequest?.abort(); requestId++;
    activeOverlay.classList.remove('open');
    document.body.classList.remove('dialog-open');
    previousFocus?.focus();
    activeOverlay = null;
  }
  document.addEventListener('keydown',event=>{
    if (!activeOverlay) return;
    if (event.key === 'Escape') { event.preventDefault();close(); }
    if (event.key === 'Tab') {
      const controls=visibleControls(activeOverlay);
      if(!controls.length){event.preventDefault();return;}
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey && (document.activeElement===first || !activeOverlay.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  async function openProfile(id) {
    const overlay=document.getElementById('modalOverlay'),content=document.getElementById('modalContent');
    if(!overlay||!content)return;
    profileRequest?.abort();profileRequest=new AbortController();
    const sequence=++requestId;
    content.textContent=window.t('Loading…');open(overlay);
    try {
      const response=await fetch('/profile/'+encodeURIComponent(id)+'/modal',{signal:profileRequest.signal,headers:{'X-Requested-With':'XMLHttpRequest'}});
      if (response.redirected) { window.location.assign(response.url); return; }
      if(!response.ok)throw new Error();
      const html=await response.text();
      if(sequence!==requestId)return;
      content.innerHTML=html;
    } catch(error) {
      if(error.name==='AbortError'||sequence!==requestId)return;
      content.textContent=window.t('Could not load profile.');
      const retry=document.createElement('button');
      retry.type='button';retry.className='btn btn-maroon';retry.textContent=window.t('Try again');
      retry.addEventListener('click',()=>openProfile(id));content.append(retry);
    }
  }
  document.addEventListener('click',event=>{
    const profile=event.target.closest('[data-open-profile-id]');
    if(profile){event.preventDefault();openProfile(profile.dataset.openProfileId);}
    const trigger=event.target.closest('[data-open-modal]');
    if(trigger){event.preventDefault();open(document.getElementById(trigger.dataset.openModal));}
    if(event.target.closest('[data-close-modal],[data-close-profile-modal]') || event.target===activeOverlay)close();
    const more=event.target.closest('[data-portal-menu]');
    if(more){
      const toggle=document.getElementById('portalSidebarToggle');
      if(toggle){toggle.checked=!toggle.checked;more.setAttribute('aria-expanded',String(toggle.checked));if(toggle.checked)visibleControls(document.querySelector('.portal-sidebar'))[0]?.focus();}
    }
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;
    const action=new URL(form.action,location.origin).pathname;
    if(form.classList.contains('saved-list-remove-action'))return;
    const actionMatch=action.match(/^\/profile\/(\d+)\/(save|unsave|express-interest|withdraw-interest)$/);
    if(!actionMatch)return;
    event.preventDefault();
    if(form.dataset.busy)return;
    form.dataset.busy='true';
    const button=form.querySelector('button[type=submit],button:not([type])');
    if(button)button.disabled=true;
    try{
      const response=await fetch(action,{method:'POST',headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams(new FormData(form))});
      if(response.redirected){location.assign(response.url);return;}
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || window.t('Could not save. Please try again.'));
      const profileId=actionMatch[1];
      const interestedAction=actionMatch[2].includes('interest');
      const selected=interestedAction?result.isInterested:result.isSaved;
      const nextAction=interestedAction
        ? (selected?'withdraw-interest':'express-interest')
        : (selected?'unsave':'save');
      document.querySelectorAll('form[action^="/profile/'+profileId+'/"]').forEach(profileForm=>{
        const isInterestForm=profileForm.classList.contains('profile-interest-action') || new URL(profileForm.action,location.origin).pathname.endsWith('/express-interest') || new URL(profileForm.action,location.origin).pathname.endsWith('/withdraw-interest');
        if(isInterestForm!==interestedAction)return;
        profileForm.setAttribute('action','/profile/'+profileId+'/'+nextAction);
        const btn=profileForm.querySelector('button');
        if(!btn)return;
        const label=window.t(interestedAction?(selected?'Unlike':'Express Interest'):(selected?'Unsave':'Save'));
        const textNode=btn.querySelector('[data-action-text]');
        const icon=btn.querySelector('i');
        if(textNode)textNode.textContent=label;else btn.textContent=label;
        if(icon)icon.className=selected
          ? (interestedAction?'fa-solid fa-heart':'fa-solid fa-bookmark')
          : (interestedAction?'fa-regular fa-heart':'fa-regular fa-bookmark');
        btn.classList.toggle('is-selected',Boolean(selected));
        btn.setAttribute('aria-pressed',String(Boolean(selected)));
        btn.setAttribute('aria-label',label);
      });
      announce(result.message);
    }catch(error){announce(error.message || window.t('Could not save. Please try again.'),true);}
    finally{delete form.dataset.busy;if(button)button.disabled=false;}
  });
  function announce(text,error=false){
    let toast=document.getElementById('appToast');
    if(!toast){toast=document.createElement('div');toast.id='appToast';toast.className='app-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}
    toast.textContent=text;toast.classList.toggle('is-error',error);toast.hidden=false;
    clearTimeout(announce.timeout);announce.timeout=setTimeout(()=>{toast.hidden=true;},5000);
  }
  // Turn staff tables into labelled cards on phones without dropping columns.
  document.querySelectorAll('table.data-table').forEach(table=>{
    const headings=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    if(!headings.length)return;
    table.classList.add('mobile-card-table');
    table.querySelectorAll('tbody tr').forEach(row=>[...row.cells].forEach((cell,index)=>{
      if(!cell.hasAttribute('data-label'))cell.dataset.label=headings[index]||'';
    }));
  });
  document.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
    if(img.closest('.ad-frame'))img.closest('.ad-frame').hidden=true;
  },{once:true}));
  function checkAdExpiry(){
    document.querySelectorAll('[data-ad-expires]').forEach(ad=>{
      const remaining=Date.parse(ad.dataset.adExpires)-Date.now();
      if(remaining<=0)ad.hidden=true;
    });
  }
  checkAdExpiry();
  if(document.querySelector('[data-ad-expires]'))setInterval(checkAdExpiry,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkAdExpiry();});
  const sidebar=document.querySelector('.portal-sidebar'),toggle=document.getElementById('portalSidebarToggle');
  document.addEventListener('keydown',event=>{
    if(toggle?.checked && event.key==='Escape'){toggle.checked=false;document.querySelector('[data-portal-menu]')?.focus();}
    if(toggle?.checked && event.key==='Tab' && sidebar){
      const nodes=visibleControls(sidebar);const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  document.querySelectorAll('.nav-lang-switch a,.lang-toggle a,.portal-language a,.mobile-language a').forEach(link=>link.addEventListener('click',event=>{
    const dirty=[...document.forms].some(form=>form.dataset.dirty==='true' && form.method.toLowerCase()==='post');
    if(dirty){event.preventDefault();announce(window.t('Please save your changes before switching language.'),true);}
  }));
  const memberDestinations=document.querySelectorAll('[data-member-destination]');
  function updateMemberDestination(){
    const path=location.pathname;
    const selected=path==='/'
      ? 'home'
      : path==='/dashboard'
        ? 'find'
        : path==='/saved-profiles'
        ? new URLSearchParams(location.search).get('tab')==='interested'?'liked':'saved'
        : path==='/my-profile'?'profile':null;
    memberDestinations.forEach(link=>{
      const active=link.dataset.memberDestination===selected;
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  }
  if(memberDestinations.length){
    updateMemberDestination();
    window.addEventListener('hashchange',updateMemberDestination);
  }
  document.addEventListener('input',event=>{if(event.target.form && event.target.type!=='password')event.target.form.dataset.dirty='true';});
})();

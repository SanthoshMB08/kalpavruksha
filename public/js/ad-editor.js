(() => {
  const form = document.getElementById('adUploadForm');
  if (!form) return;
  const placement = document.getElementById('adPlacement');
  const desktop = document.getElementById('adDesktop');
  const mobile = document.getElementById('adMobile');
  const feedback = document.getElementById('adImageFeedback');
  const urls = new Map();
  function render() {
    const frame = window.AD_FRAMES[placement.value];
    for (const kind of ['desktop','mobile']) {
      const dimensions = frame[kind];
      document.getElementById(kind + 'Size').textContent = dimensions.join(' × ') + ' px';
      const preview = document.getElementById(kind + 'Preview');
      preview.style.aspectRatio = dimensions[0] + '/' + dimensions[1];
      const file = kind === 'mobile' ? mobile.files[0] || desktop.files[0] : desktop.files[0];
      const img = preview.querySelector('img');
      if (urls.has(kind)) URL.revokeObjectURL(urls.get(kind));
      img.hidden = !file;
      preview.querySelector('span').hidden = !!file;
      if (file) {
        const url = URL.createObjectURL(file);
        urls.set(kind,url); img.src = url;
      }
    }
  }
  function validate(input) {
    const file = input.files[0];
    const invalid = file && (file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type));
    const message = invalid ? window.t('Choose a JPG, PNG or WEBP image no larger than 5 MB.') : '';
    input.setCustomValidity(message);
    feedback.textContent = message;
    if (invalid) input.reportValidity();
    render();
  }
  placement.addEventListener('change',render);
  desktop.addEventListener('change',()=>validate(desktop));
  mobile.addEventListener('change',()=>validate(mobile));
  form.addEventListener('submit',()=>{
    const button = form.querySelector('[type=submit]');
    button.disabled = true; button.textContent = window.t('Publishing…');
  });
  render();
})();

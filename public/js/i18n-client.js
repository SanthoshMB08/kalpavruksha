(() => {
  window.currentLang = document.documentElement.lang;
  const messages = window.KK_MESSAGES || {};
  const normalized = Object.fromEntries(Object.entries(messages).map(([key,value])=>[key.toLowerCase(),value]));
  window.t = (key,values={}) => {
    const text = String(key ?? '');
    const translated = document.documentElement.lang === 'kn' ? messages[text] || normalized[text.toLowerCase()] || text : text;
    return translated.replace(/\{(\w+)\}/g,(whole,name)=>Object.hasOwn(values,name)?String(values[name]):whole);
  };
  window.formatLocalDate = value => new Intl.DateTimeFormat(document.documentElement.lang === 'kn'?'kn-IN':'en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value));
})();

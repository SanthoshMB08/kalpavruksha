(function () {
  function utf8Length(value) {
    return new TextEncoder().encode(value).length;
  }

  function initializePasswordStrength(input) {
    var field = input.closest('.field');
    var panel = field && field.querySelector('[data-password-strength-panel]');
    if (!panel) return;

    var rules = Array.from(panel.querySelectorAll('[data-password-rule]'));
    var bar = panel.querySelector('[data-password-strength-bar]');
    var label = panel.querySelector('[data-password-strength-label]');
    var meter = panel.querySelector('[role="progressbar"]');
    var form = input.form;

    function evaluate() {
      var value = input.value;
      var checks = {
        length: value.length >= 8,
        upper: /[A-Z]/.test(value),
        lower: /[a-z]/.test(value),
        number: /[0-9]/.test(value),
        bytes: utf8Length(value) <= 72
      };
      var score = 0;
      var isTooLong = !checks.bytes;

      rules.forEach(function (item) {
        var met = checks[item.getAttribute('data-password-rule')];
        if (met) score++;
        item.classList.toggle('met', met);
        var icon = item.querySelector('.rule-icon');
        if (icon) {
          icon.classList.toggle('fa-check', met);
          icon.classList.toggle('fa-xmark', !met);
        }
      });

      var valid = score === rules.length;
      var state = isTooLong ? 'too-long' : score === rules.length ? 'strong' : score >= 3 ? 'fair' : 'weak';
      var text = !value ? panel.dataset.labelEmpty :
        isTooLong ? panel.dataset.labelTooLong :
          score === rules.length ? panel.dataset.labelStrong :
            score >= 3 ? panel.dataset.labelFair : panel.dataset.labelWeak;

      input.setCustomValidity(value && !valid ? panel.dataset.invalidMessage : '');
      input.setAttribute('aria-invalid', value && !valid ? 'true' : 'false');
      label.textContent = text;
      label.dataset.strength = state;
      meter.setAttribute('aria-valuenow', String(score));
      meter.setAttribute('aria-valuetext', text);
      bar.style.width = (score / rules.length * 100) + '%';
      bar.dataset.strength = state;

      if (form && form.dataset.passwordRequiresConsent) {
        var button = form.querySelector('button[type="submit"]');
        var consentNames = form.dataset.passwordRequiresConsent.split(',');
        var consented = consentNames.every(function (name) {
          var checkbox = form.querySelector('[name="' + name.trim() + '"]');
          return checkbox && checkbox.checked;
        });
        if (button) button.disabled = !valid || !consented;
      }
    }

    input.addEventListener('input', evaluate);
    if (form && form.dataset.passwordRequiresConsent) {
      form.addEventListener('change', function (event) {
        if (event.target.matches('[type="checkbox"]')) evaluate();
      });
    }
    evaluate();
  }

  document.querySelectorAll('[data-password-strength-input]').forEach(initializePasswordStrength);
})();

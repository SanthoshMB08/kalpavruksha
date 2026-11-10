(function () {
  var nextId = 0;

  function initialize(input) {
    var listId = input.getAttribute('list');
    var datalist = listId && document.getElementById(listId);
    if (!datalist) return;

    nextId += 1;
    var listboxId = 'searchable-input-options-' + nextId;
    var menu = document.createElement('div');
    menu.className = 'searchable-input-menu';
    menu.hidden = true;
    var listbox = document.createElement('div');
    listbox.className = 'searchable-input-options';
    listbox.id = listboxId;
    listbox.setAttribute('role', 'listbox');
    menu.appendChild(listbox);
    document.body.appendChild(menu);

    input.removeAttribute('list');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', listboxId);
    input.setAttribute('aria-expanded', 'false');
    if (!input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
      var field = input.closest('.field, .fc-field');
      var label = field && field.querySelector('label');
      if (label) {
        if (!label.id) label.id = listboxId + '-label';
        input.setAttribute('aria-labelledby', label.id);
      }
    }

    var activeIndex = -1;
    var options = [];

    function close() {
      menu.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    }

    function positionMenu() {
      if (menu.hidden) return;
      var bounds = input.getBoundingClientRect();
      var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      var spaceBelow = viewportHeight - bounds.bottom - 8;
      var spaceAbove = bounds.top - 8;
      var openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
      var availableHeight = Math.max(100, Math.min(320, openAbove ? spaceAbove : spaceBelow));

      menu.style.left = Math.max(8, bounds.left) + 'px';
      menu.style.width = Math.min(bounds.width, window.innerWidth - 16) + 'px';
      menu.style.maxHeight = availableHeight + 'px';
      if (openAbove) {
        menu.style.top = Math.max(8, bounds.top - Math.min(availableHeight, menu.offsetHeight || availableHeight) - 6) + 'px';
        menu.style.bottom = 'auto';
      } else {
        menu.style.top = Math.min(viewportHeight - 8, bounds.bottom + 6) + 'px';
        menu.style.bottom = 'auto';
      }
    }

    function selectOption(option) {
      input.value = option.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }

    function setActive(index) {
      activeIndex = !options.length || index < 0 ? -1 : index % options.length;
      options.forEach(function (option, optionIndex) {
        option.classList.toggle('is-active', optionIndex === activeIndex);
        if (activeIndex >= 0) option.setAttribute('aria-selected', String(optionIndex === activeIndex));
      });
      if (activeIndex >= 0) {
        var active = options[activeIndex];
        input.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function renderOptions() {
      var query = input.value.trim().toLocaleLowerCase();
      listbox.textContent = '';
      options = [];

      Array.prototype.forEach.call(datalist.options, function (sourceOption) {
        var value = sourceOption.value;
        var label = sourceOption.label || value;
        if (query && (value + ' ' + label).toLocaleLowerCase().indexOf(query) === -1) return;

        var option = document.createElement('button');
        option.type = 'button';
        option.className = 'searchable-input-option';
        option.id = listboxId + '-option-' + options.length;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(value === input.value));
        option.textContent = label;
        option.addEventListener('pointerdown', function (event) { event.preventDefault(); });
        option.addEventListener('click', function () { selectOption(sourceOption); });
        option.addEventListener('pointermove', function () { setActive(options.indexOf(option)); });
        listbox.appendChild(option);
        options.push(option);
      });

      if (!options.length) {
        var empty = document.createElement('div');
        empty.className = 'searchable-input-empty';
        empty.textContent = window.t ? window.t('No matching options') : 'No matching options';
        listbox.appendChild(empty);
      }
      setActive(-1);
      positionMenu();
    }

    function open() {
      if (input.disabled || input.readOnly) return;
      menu.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      renderOptions();
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', function () {
      if (!menu.hidden) renderOptions();
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) open();
        var nextIndex = activeIndex < 0
          ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
          : activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
        setActive(nextIndex);
      } else if (event.key === 'Enter' && !menu.hidden && activeIndex >= 0) {
        event.preventDefault();
        options[activeIndex].click();
      } else if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        close();
      }
    });
    input.addEventListener('blur', function () {
      window.setTimeout(function () {
        if (document.activeElement !== input && !menu.contains(document.activeElement)) close();
      }, 0);
    });

    var observer = new MutationObserver(function () {
      if (!menu.hidden) renderOptions();
    });
    observer.observe(datalist, { childList: true, subtree: true, attributes: true });

    document.addEventListener('pointerdown', function (event) {
      if (event.target !== input && !menu.contains(event.target)) close();
    });
    window.addEventListener('scroll', positionMenu, true);
    window.addEventListener('resize', positionMenu);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', positionMenu);
      window.visualViewport.addEventListener('scroll', positionMenu);
    }
  }

  document.querySelectorAll('input[list]').forEach(initialize);
})();

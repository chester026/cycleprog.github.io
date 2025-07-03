const checklist = [
  { section: 'Что купить', items: [
    'Велосипед (шоссейный/гравийный)',
    'Шлем',
    'Carbon wheelset: DT Swiss ERC 1100 DICUT 35 (Disc) / ERC 1400',
    'Continental Grand Prix 5000 S TR Folding Tire - 30-622 - black/transparent',
    'Велотуфли и педали',
    'Запасная камера/ремкомплект',
    'Насос/баллон CO₂',
    'Бутылки для воды',
    'Велоформа (джерси, шорты)',
    'Очки',
    'Перчатки',
    'Задний фонарь',
    'Передний фонарь',
    'Велокомпьютер или держатель для телефона',
    'Смазка для цепи',
    'Мультиинструмент',
    'Сумка подседельная/рамная',
    'Закупить гели/батончики для питания',
  ]},
  { section: 'Что сделать', items: [
    'Проверить техническое состояние велосипеда',
    'Настроить посадку (bike fit)',
    'Зарегистрироваться на Gran Fondo',
  ]}
];

function renderChecklist(animKey) {
  // Рендерим каждую секцию отдельно
  const buy = checklist[0];
  const todo = checklist[1];

  function renderSection(section, sectionIdx) {
    // Сортируем: сначала невыполненные, потом выполненные
    const items = section.items.map((item, j) => {
      const key = `checklist_${sectionIdx}_${j}`;
      const checked = localStorage.getItem(key) === '1';
      return { item, key, checked };
    });
    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);
    const sorted = unchecked.concat(checked);
    let html = `<h2>${section.section}</h2><ul class='checklist-ul'>`;
    sorted.forEach(({item, key, checked}) => {
      let animClass = '';
      if (animKey && animKey === key) {
        animClass = checked ? 'anim-fade-out' : 'anim-fade-out';
      }
      html += `<li class='checklist-item ${animClass}' data-key='${key}'><label><input type='checkbox' data-key='${key}' ${checked ? 'checked' : ''}> <span>${item}</span></label></li>`;
    });
    html += '</ul>';
    return html;
  }

  document.getElementById('checklist-buy').innerHTML = renderSection(buy, 0);
  document.getElementById('checklist-do').innerHTML = renderSection(todo, 1);

  // После рендера, если был анимируемый элемент, через 350мс перерисовать с fade-in
  if (animKey) {
    setTimeout(() => {
      // Перерисовываем, но теперь для этого элемента ставим fade-in
      function renderSectionAnimIn(section, sectionIdx) {
        const items = section.items.map((item, j) => {
          const key = `checklist_${sectionIdx}_${j}`;
          const checked = localStorage.getItem(key) === '1';
          return { item, key, checked };
        });
        const unchecked = items.filter(i => !i.checked);
        const checkedArr = items.filter(i => i.checked);
        const sorted = unchecked.concat(checkedArr);
        let html = `<h2>${section.section}</h2><ul class='checklist-ul'>`;
        sorted.forEach(({item, key, checked}) => {
          let animClass = '';
          if (animKey === key) animClass = 'anim-fade-in';
          html += `<li class='checklist-item ${animClass}' data-key='${key}'><label><input type='checkbox' data-key='${key}' ${checked ? 'checked' : ''}> <span>${item}</span></label></li>`;
        });
        html += '</ul>';
        return html;
      }
      document.getElementById('checklist-buy').innerHTML = renderSectionAnimIn(buy, 0);
      document.getElementById('checklist-do').innerHTML = renderSectionAnimIn(todo, 1);
      // Восстанавливаем обработчики
      document.querySelectorAll('input[type=checkbox][data-key]').forEach(cb => {
        cb.addEventListener('change', e => {
          localStorage.setItem(cb.dataset.key, cb.checked ? '1' : '0');
          renderChecklist(cb.dataset.key);
        });
      });
    }, 350);
    return;
  }

  document.querySelectorAll('input[type=checkbox][data-key]').forEach(cb => {
    cb.addEventListener('change', e => {
      localStorage.setItem(cb.dataset.key, cb.checked ? '1' : '0');
      renderChecklist(cb.dataset.key);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => renderChecklist()); 
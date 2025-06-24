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

function renderChecklist() {
  let html = '';
  checklist.forEach((block, i) => {
    html += `<div><h2>${block.section}</h2><ul class='checklist-ul'>`;
    block.items.forEach((item, j) => {
      const key = `checklist_${i}_${j}`;
      const checked = localStorage.getItem(key) === '1';
      html += `<li class='checklist-item'><label><input type='checkbox' data-key='${key}' ${checked ? 'checked' : ''}> <span>${item}</span></label></li>`;
    });
    html += '</ul></div>';
  });
  document.getElementById('checklist-block').innerHTML = html;
  document.querySelectorAll('input[type=checkbox][data-key]').forEach(cb => {
    cb.addEventListener('change', e => {
      localStorage.setItem(cb.dataset.key, cb.checked ? '1' : '0');
    });
  });
}

document.addEventListener('DOMContentLoaded', renderChecklist); 
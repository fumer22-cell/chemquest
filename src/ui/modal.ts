/** A simple centred dialog over the whole app. Resolves when a button is pressed. */
export function showModal(opts: {
  title: string;
  html: string;
  buttons?: { label: string; primary?: boolean; value: string }[];
  wide?: boolean;
}): Promise<string> {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const card = document.createElement('div');
    card.className = `modal${opts.wide ? ' wide' : ''}`;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.innerHTML = `<h2>${opts.title}</h2><div class="modal-body">${opts.html}</div><div class="modal-actions"></div>`;
    const actions = card.querySelector('.modal-actions')!;
    for (const b of opts.buttons ?? [{ label: 'OK', primary: true, value: 'ok' }]) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.primary) btn.classList.add('primary');
      btn.onclick = () => {
        back.remove();
        resolve(b.value);
      };
      actions.append(btn);
    }
    back.append(card);
    document.body.append(back);
    (actions.querySelector('button.primary') as HTMLButtonElement | null)?.focus();
  });
}

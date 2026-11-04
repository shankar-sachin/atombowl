// @ts-nocheck
// Copy code / Copy link / Copy invite buttons under a room code (Basic and Advanced hosts).

const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const ICONS = {
  code: `${ICON}<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>`,
  link: `${ICON}<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>`,
  invite: `${ICON}<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>`
};

export function joinLink(code) {
  return new URL(`/buzzer-rooms?code=${encodeURIComponent(code)}`, window.location.href).href;
}

export function inviteText(room) {
  const code = room.roomCode;
  const named = room.roomName && room.settings?.mode !== "basic" ? ` "${room.roomName}"` : "";
  const page = new URL("/buzzer-rooms", window.location.href).href;
  return [
    `Join my Atom Bowl buzzer room${named}!`,
    "",
    `Join here: ${joinLink(code)}`,
    `Or go to ${page} and enter code ${code}.`
  ].join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this:", text);
    return false;
  }
}

/** Fill `container` with the three copy buttons. `getRoom` returns the current room (or null). */
export function mountCopyButtons(container, getRoom) {
  const items = [
    ["code", "Copy code", (room) => room.roomCode],
    ["link", "Copy link", (room) => joinLink(room.roomCode)],
    ["invite", "Copy invite", (room) => inviteText(room)]
  ];
  container.classList.add("copy-row");
  container.replaceChildren();
  for (const [key, label, text] of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn small copy-btn";
    button.innerHTML = ICONS[key];
    const span = document.createElement("span");
    span.textContent = label;
    button.appendChild(span);
    let timer = 0;
    button.addEventListener("click", async () => {
      const room = getRoom();
      if (!room?.roomCode) return;
      if (!(await copyText(text(room)))) return;
      span.textContent = "Copied";
      button.classList.add("copied");
      clearTimeout(timer);
      timer = setTimeout(() => { span.textContent = label; button.classList.remove("copied"); }, 1500);
    });
    container.appendChild(button);
  }
}

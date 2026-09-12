// @ts-nocheck
const nav = document.getElementById('nav');
const overlay = document.getElementById('overlay');
const hamburger = document.getElementById('hamburger');
function toggleNav() {
    const isOpen = nav.classList.toggle('open');
    overlay.classList.toggle('show');
    hamburger.classList.toggle('open');
    hamburger.textContent = isOpen ? 'âœ•' : 'â˜°';
}
hamburger.onclick = toggleNav;
overlay.onclick = toggleNav;
function go(page) {
    if (window.atomNavigate) {
        window.atomNavigate(page);
        return;
    }
    window.location.href = page;
}
let seconds = 10;
const secEl = document.getElementById('sec');
const countdownTimer = setInterval(() => {
    seconds -= 1;
    if (secEl)
        secEl.textContent = seconds;
    if (seconds <= 0) {
        clearInterval(countdownTimer);
        window.location.href = 'index.html';
    }
}, 1000);
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => clearInterval(countdownTimer));
});
if (window.innerWidth < 480)
    seconds = 5;
if (seconds <= 0) {
    clearInterval(countdownTimer);
    document.body.style.opacity = '0';
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 300);
}
//# sourceMappingURL=404.js.map
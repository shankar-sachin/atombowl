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
hamburger.addEventListener('click', toggleNav);
overlay.addEventListener('click', toggleNav);
//# sourceMappingURL=tutor.js.map
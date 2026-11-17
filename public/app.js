const STORE_KEY = "dentalux_bookings_v1";
const getBookings = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; } };
const saveBookings = (items) => localStorage.setItem(STORE_KEY, JSON.stringify(items));

const form = document.getElementById("bookingForm");
if (form) {
  const dateInput = document.getElementById("bookingDate");
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  dateInput.min = localToday;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (new Date(data.date + "T00:00:00") < new Date(localToday + "T00:00:00")) {
      document.getElementById("formMessage").textContent = "Iltimos, bugungi yoki kelajakdagi sanani tanlang.";
      return;
    }
    const bookings = getBookings();
    const duplicate = bookings.some(b => b.date === data.date && b.time === data.time && b.doctor === data.doctor && b.status !== "Bekor qilingan");
    if (duplicate) {
      document.getElementById("formMessage").textContent = "Bu shifokor uchun tanlangan vaqt band. Boshqa vaqtni tanlang.";
      return;
    }
    bookings.unshift({ id: Date.now(), ...data, status: "Kutilmoqda", createdAt: new Date().toISOString() });
    saveBookings(bookings);
    document.getElementById("formMessage").textContent = "So‘rovingiz saqlandi! Administrator siz bilan bog‘lanadi.";
    form.reset(); dateInput.min = localToday;
  });
}
const menuToggle = document.getElementById("menuToggle");
if (menuToggle) menuToggle.addEventListener("click", () => document.getElementById("nav").classList.toggle("open"));

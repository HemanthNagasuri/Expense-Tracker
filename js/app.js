// --- STATE MANAGEMENT ---
const DEFAULT_CATEGORIES = ["Food Outside", "Random Stuff", "Online Shopping", "Laundry", "Transport", "Utilities"];
let expenses = JSON.parse(localStorage.getItem("hostelSpend_expenses")) || [];
let baseMonthlyBudget = parseFloat(localStorage.getItem("hostelSpend_budget")) || 0;
let rolloverAmount = parseFloat(localStorage.getItem("hostelSpend_rollover")) || 0;
let categoryLimits = JSON.parse(localStorage.getItem("hostelSpend_categoryLimits")) || {};
let budgetStartDateStr = localStorage.getItem("hostelSpend_budgetStartDate");
let lastOpenedMonth = localStorage.getItem("hostelSpend_lastOpenedMonth");

// Month Change & Rollover Detection
const todayObj = new Date();
const currentMonthStr = todayObj.toISOString().slice(0, 7); // YYYY-MM
const todayStr = todayObj.toISOString().split('T')[0];

if (!lastOpenedMonth) {
  lastOpenedMonth = currentMonthStr;
  localStorage.setItem("hostelSpend_lastOpenedMonth", lastOpenedMonth);
} else if (lastOpenedMonth !== currentMonthStr) {
  // Month has changed: Calculate rollover from previous month
  const prevMonthExpenses = expenses.filter(exp => exp.date.startsWith(lastOpenedMonth));
  const prevSpent = prevMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const prevEffectiveBudget = baseMonthlyBudget + rolloverAmount;
  const unspent = prevEffectiveBudget - prevSpent;
  
  if (unspent > 0 && baseMonthlyBudget > 0) {
    rolloverAmount = unspent;
  } else {
    rolloverAmount = 0;
  }
  localStorage.setItem("hostelSpend_rollover", rolloverAmount);
  
  // Reset start date to the 1st of the new month
  budgetStartDateStr = `${currentMonthStr}-01`;
  localStorage.setItem("hostelSpend_budgetStartDate", budgetStartDateStr);
  
  lastOpenedMonth = currentMonthStr;
  localStorage.setItem("hostelSpend_lastOpenedMonth", lastOpenedMonth);
}

if (!budgetStartDateStr) {
  budgetStartDateStr = `${currentMonthStr}-01`;
  localStorage.setItem("hostelSpend_budgetStartDate", budgetStartDateStr);
}

// Total budget for this month includes whatever rolled over from last month
let effectiveBudget = baseMonthlyBudget + rolloverAmount;

// --- DOM ELEMENTS ---
const views = document.querySelectorAll("section[data-view]");
const navBtns = document.querySelectorAll(".nav-btn");
const appHeading = document.getElementById("app-heading");
const monthLabel = document.getElementById("month-label");
const toastEl = document.getElementById("toast");

const spentTotalEl = document.getElementById("spent-total");
const budgetTotalEl = document.getElementById("budget-total");
const budgetRemainingEl = document.getElementById("budget-remaining");
const budgetProgressEl = document.getElementById("budget-progress");
const dailyAllowableEl = document.getElementById("daily-allowable");
const dailyStatusEl = document.getElementById("daily-status");
const daysLeftEl = document.getElementById("days-left");
const expenseListEl = document.getElementById("expense-list");
const categoryListEl = document.getElementById("category-list");

const expenseForm = document.getElementById("expense-form");
const settingsForm = document.getElementById("settings-form");
const dateInput = document.getElementById("date");
const categoryLimitsContainer = document.getElementById("category-limits");

// --- INITIALIZATION ---
function init() {
  dateInput.value = todayStr;
  buildCategoryLimitInputs();
  updateDashboard();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(err => console.error(err));
  }
}

// --- NAVIGATION ---
navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetView = btn.dataset.nav;
    
    navBtns.forEach(b => {
      b.classList.remove("text-teal-300");
      b.classList.add("text-zinc-400");
    });
    btn.classList.remove("text-zinc-400");
    btn.classList.add("text-teal-300");

    views.forEach(view => {
      if (view.dataset.view === targetView) view.classList.remove("hidden");
      else view.classList.add("hidden");
    });

    if (targetView === "dashboard") {
      appHeading.textContent = "Dashboard";
      updateDashboard();
    } else if (targetView === "add") {
      appHeading.textContent = "Add Expense";
    } else if (targetView === "settings") {
      appHeading.textContent = "Limits & Budget";
      document.getElementById("monthly-budget").value = baseMonthlyBudget || "";
    }
  });
});

// --- CORE LOGIC & UI UPDATES ---
function updateDashboard() {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  monthLabel.innerHTML = now.toLocaleString('default', { month: 'short', year: 'numeric' });

  // Get expenses since the budget cycle started this month
  const cycleExpenses = expenses.filter(exp => exp.date >= budgetStartDateStr && exp.date.startsWith(currentMonth));
  const totalSpent = cycleExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  spentTotalEl.innerHTML = `&#8377;${totalSpent.toFixed(2)}`;
  budgetTotalEl.innerHTML = `&#8377;${effectiveBudget.toFixed(2)}`;
  
  if (effectiveBudget > 0) {
    const remaining = effectiveBudget - totalSpent;
    budgetRemainingEl.innerHTML = `&#8377;${Math.max(0, remaining).toFixed(2)} left`;
    
    let percentage = (totalSpent / effectiveBudget) * 100;
    if (percentage > 100) percentage = 100;
    budgetProgressEl.style.width = `${percentage}%`;
    
    if (percentage > 90) budgetProgressEl.className = "h-full w-0 rounded-full transition-all duration-300 bg-rose-500";
    else if (percentage > 75) budgetProgressEl.className = "h-full w-0 rounded-full transition-all duration-300 bg-orange-400";
    else budgetProgressEl.className = "h-full w-0 rounded-full transition-all duration-300 bg-teal-400";
  }

  // --- CUMULATIVE DAILY MATH ---
  const budgetStartDate = new Date(budgetStartDateStr);
  
  // Create a rolling cycle based on the current month's total days (e.g., 30 or 31)
  const currentMonthTotalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const endOfCycle = new Date(budgetStartDate);
  endOfCycle.setDate(budgetStartDate.getDate() + currentMonthTotalDays - 1);
  
  const totalDaysInCycle = currentMonthTotalDays;
  
  const normalizedToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const normalizedStart = new Date(budgetStartDate.getFullYear(), budgetStartDate.getMonth(), budgetStartDate.getDate());
  
  let daysPassed = Math.round((normalizedToday - normalizedStart) / (1000 * 60 * 60 * 24)) + 1;
  if (daysPassed < 1) daysPassed = 1;

  let daysLeft = totalDaysInCycle - daysPassed + 1;
  if (daysLeft < 0) daysLeft = 0;
  
  daysLeftEl.innerHTML = `${daysLeft} days left`;

  if (baseMonthlyBudget === 0) {
    dailyAllowableEl.innerHTML = "&#8377;0";
    dailyStatusEl.textContent = "Set a budget first";
    dailyStatusEl.className = "rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300";
  } else {
    const remainingTotal = effectiveBudget - totalSpent;
    if (remainingTotal <= 0) {
      dailyAllowableEl.innerHTML = "&#8377;0";
      dailyStatusEl.textContent = "Budget Exceeded";
      dailyStatusEl.className = "rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-300";
    } else {
      // The cumulative formula: (Base daily limit * Days passed) - Total spent so far
      const baseDailyLimit = effectiveBudget / totalDaysInCycle;
      const allowableCumulative = baseDailyLimit * daysPassed;
      const todayLimit = allowableCumulative - totalSpent;
      
      if (todayLimit < 0) {
          dailyAllowableEl.innerHTML = "&#8377;0";
          dailyStatusEl.textContent = "Over Daily Pacing";
          dailyStatusEl.className = "rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-400";
      } else {
          dailyAllowableEl.innerHTML = `&#8377;${Math.floor(todayLimit)}`;
          dailyStatusEl.textContent = "On Track";
          dailyStatusEl.className = "rounded-full bg-teal-400/15 px-2.5 py-1 text-xs font-semibold text-teal-200";
      }
    }
  }

  renderRecentExpenses(cycleExpenses);
  renderCategoryLimits(cycleExpenses);
}

function renderRecentExpenses(cycleExpenses) {
  if (cycleExpenses.length === 0) {
    expenseListEl.innerHTML = `<li class="rounded-2xl border border-dashed border-white/10 bg-ink-900 px-4 py-8 text-center text-sm text-zinc-500">No expenses yet.</li>`;
    return;
  }
  
  const sorted = [...cycleExpenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  
  expenseListEl.innerHTML = sorted.map(exp => `
    <li class="flex items-center justify-between rounded-2xl border border-white/5 bg-ink-900/50 p-4">
      <div>
        <p class="text-sm font-medium text-zinc-200">${exp.category}</p>
        <p class="mt-0.5 text-xs text-zinc-500">${exp.date} ${exp.note ? '&bull; ' + exp.note : ''}</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-semibold text-white">&#8377;${exp.amount.toFixed(2)}</span>
        <button data-delete-id="${exp.id}" class="rounded-lg bg-rose-500/10 p-2 text-rose-400 transition hover:bg-rose-500/20 active:scale-95" aria-label="Delete expense">
          <svg class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </li>
  `).join('');
}

function renderCategoryLimits(cycleExpenses) {
  const categoryTotals = {};
  DEFAULT_CATEGORIES.forEach(c => categoryTotals[c] = 0);
  
  cycleExpenses.forEach(exp => {
    if (categoryTotals[exp.category] !== undefined) {
      categoryTotals[exp.category] += exp.amount;
    }
  });

  categoryListEl.innerHTML = DEFAULT_CATEGORIES.map(cat => {
    const spent = categoryTotals[cat];
    const limit = categoryLimits[cat];
    if (!limit && spent === 0) return '';
    
    let progressHtml = '';
    if (limit) {
      let pct = (spent / limit) * 100;
      if (pct > 100) pct = 100;
      const colorClass = pct > 90 ? 'bg-rose-500' : 'bg-teal-400';
      progressHtml = `
        <div class="mt-2.5 flex items-center justify-between text-xs">
          <span class="text-zinc-500">&#8377;${spent.toFixed(0)} / &#8377;${limit}</span>
          <span class="${pct > 90 ? 'text-rose-400' : 'text-zinc-400'}">${Math.floor(pct)}%</span>
        </div>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div class="h-full w-0 rounded-full ${colorClass} transition-all duration-300" style="width: ${pct}%"></div>
        </div>
      `;
    } else {
      progressHtml = `<div class="mt-1 text-xs text-zinc-500">&#8377;${spent.toFixed(0)} spent (No limit)</div>`;
    }

    return `
      <div class="rounded-2xl border border-white/5 bg-ink-900/50 p-4">
        <p class="text-sm font-medium text-zinc-200">${cat}</p>
        ${progressHtml}
      </div>
    `;
  }).join('');
  
  if (categoryListEl.innerHTML.trim() === '') {
    categoryListEl.innerHTML = `<p class="rounded-2xl border border-dashed border-white/10 bg-ink-900 px-4 py-8 text-center text-sm text-zinc-500">Add an expense or set limits to see breakdowns.</p>`;
  }
}

function buildCategoryLimitInputs() {
  categoryLimitsContainer.innerHTML = DEFAULT_CATEGORIES.map(cat => `
    <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-ink-800/50 p-3">
      <label class="text-sm font-medium text-zinc-300 w-1/2 truncate">${cat}</label>
      <input 
        type="number" 
        data-limit-category="${cat}"
        value="${categoryLimits[cat] || ''}"
        placeholder="No limit"
        class="w-1/2 rounded-xl bg-ink-900 px-3 py-2 text-sm text-white outline-none ring-teal-400/40 focus:ring"
      />
    </div>
  `).join('');
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

// --- EVENT LISTENERS ---
expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const date = document.getElementById("date").value;
  const note = document.getElementById("note").value.trim();

  if (!amount || !category || !date) return;

  expenses.push({
    id: Date.now().toString(),
    amount,
    category,
    date,
    note
  });
  localStorage.setItem("hostelSpend_expenses", JSON.stringify(expenses));
  
  showToast("Expense added successfully!");
  
  document.getElementById("amount").value = "";
  document.getElementById("category").value = "";
  document.getElementById("note").value = "";
  
  updateDashboard();
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const budgetInput = document.getElementById("monthly-budget").value;
  baseMonthlyBudget = parseFloat(budgetInput) || 0;
  
  const limitInputs = document.querySelectorAll("input[data-limit-category]");
  categoryLimits = {};
  limitInputs.forEach(input => {
    const val = parseFloat(input.value);
    if (val > 0) categoryLimits[input.dataset.limitCategory] = val;
  });

  // When you set a new budget, it sets the start date to today for prorating
  budgetStartDateStr = new Date().toISOString().split('T')[0];
  localStorage.setItem("hostelSpend_budgetStartDate", budgetStartDateStr);
  localStorage.setItem("hostelSpend_budget", baseMonthlyBudget);
  localStorage.setItem("hostelSpend_categoryLimits", JSON.stringify(categoryLimits));
  
  effectiveBudget = baseMonthlyBudget + rolloverAmount;
  
  showToast("Limits updated & budget cycle restarted from today!");
  updateDashboard();
});

// Handle Deleting an Expense
expenseListEl.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest("button[data-delete-id]");
  if (!deleteBtn) return;

  const idToDelete = deleteBtn.dataset.deleteId;
  
  if (confirm("Are you sure you want to delete this expense?")) {
    // Remove the expense from the array
    expenses = expenses.filter(exp => exp.id !== idToDelete);
    
    // Save the updated array back to local storage
    localStorage.setItem("hostelSpend_expenses", JSON.stringify(expenses));
    
    // Show a success message and recalculate all budgets
    showToast("Expense deleted!");
    updateDashboard();
  }
});

// Run on load
init();
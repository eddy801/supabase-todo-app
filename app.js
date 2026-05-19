// app.js

// State
let currentDate = new Date();
let currentCalendarDate = new Date();
let todos = [];
let supabaseClient = null;

// DOM Elements
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const calendarMonthDisplay = document.getElementById('calendar-month-display');
const calendarGrid = document.getElementById('calendar-grid');
const todoForm = document.getElementById('add-todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');

const configModal = document.getElementById('config-modal');
const openConfigBtn = document.getElementById('open-config-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const urlInput = document.getElementById('supabase-url');
const keyInput = document.getElementById('supabase-key');
const groqKeyInput = document.getElementById('groq-key');
const aiSuggestBtn = document.getElementById('ai-suggest-btn');

// Initialize
function init() {
    initSupabase();
    setupEventListeners();
    renderCalendar();
    fetchTodos();
}

function initSupabase() {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');

    if (url && key && window.supabase) {
        supabaseClient = window.supabase.createClient(url, key);
        console.log("Supabase initialized");
    } else {
        supabaseClient = null;
        console.log("Using LocalStorage fallback");
    }
}

// Event Listeners
function setupEventListeners() {
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));
    todoForm.addEventListener('submit', handleAddTodo);
    aiSuggestBtn.addEventListener('click', suggestTaskBreakdownWithAI);

    // Modal
    openConfigBtn.addEventListener('click', () => {
        urlInput.value = localStorage.getItem('supabase_url') || '';
        keyInput.value = localStorage.getItem('supabase_key') || '';
        groqKeyInput.value = localStorage.getItem('groq_key') || '';
        configModal.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
        configModal.classList.remove('active');
    });

    saveConfigBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        const key = keyInput.value.trim();
        const groqKey = groqKeyInput.value.trim();

        if (url && key) {
            localStorage.setItem('supabase_url', url);
            localStorage.setItem('supabase_key', key);
            initSupabase();
        } else {
            localStorage.removeItem('supabase_url');
            localStorage.removeItem('supabase_key');
            supabaseClient = null;
        }

        if (groqKey) {
            localStorage.setItem('groq_key', groqKey);
        } else {
            localStorage.removeItem('groq_key');
        }

        configModal.classList.remove('active');
        fetchTodos(); // Refetch with new config
    });
}

// Date Handling
function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';
    
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    calendarMonthDisplay.textContent = `${monthNames[month]} ${year}`;

    // Get day of week for 1st of month (0 = Sun, 1 = Mon... 6 = Sat)
    let firstDay = new Date(year, month, 1).getDay();
    // Convert to Monday-start (0 = Mon, 6 = Sun)
    firstDay = firstDay === 0 ? 6 : firstDay - 1;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('calendar-day', 'empty');
        calendarGrid.appendChild(emptyCell);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('calendar-day');
        dayCell.textContent = i;
        
        if (year === currentDate.getFullYear() && month === currentDate.getMonth() && i === currentDate.getDate()) {
            dayCell.classList.add('active');
        }
        
        if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
            dayCell.classList.add('today');
        }

        dayCell.addEventListener('click', () => {
            currentDate = new Date(year, month, i);
            renderCalendar(); 
            fetchTodos();
        });

        calendarGrid.appendChild(dayCell);
    }
}

function getFormattedDateString() {
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
}

// Data Fetching
async function fetchTodos() {
    const dateStr = getFormattedDateString();
    
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('todos')
                .select('*')
                .eq('date', dateStr)
                .order('created_at', { ascending: true });
                
            if (error) throw error;
            todos = data || [];
            renderTodos();
        } catch (error) {
            console.error("Error fetching from Supabase:", error);
            alert("Error fetching from Supabase. Check console or use Local Storage.");
            // Fallback to local
            fetchLocalTodos(dateStr);
        }
    } else {
        fetchLocalTodos(dateStr);
    }
}

function fetchLocalTodos(dateStr) {
    const localData = localStorage.getItem(`todos_${dateStr}`);
    todos = localData ? JSON.parse(localData) : [];
    renderTodos();
}

// Add Todo
async function handleAddTodo(e) {
    e.preventDefault();
    const task = todoInput.value.trim();
    if (!task) return;

    todoInput.value = ''; // clear early
    await addTodoInternal(task);
}

async function addTodoInternal(task, parentId = null) {
    const dateStr = getFormattedDateString();

    const newTodo = {
        id: crypto.randomUUID(),
        task: task,
        is_completed: false,
        date: dateStr,
        parent_id: parentId,
        created_at: new Date().toISOString()
    };

    // Optimistic UI Update
    todos.push(newTodo);
    renderTodos();

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('todos')
                .insert([newTodo]);
                
            if (error) throw error;
        } catch (error) {
            console.error("Error inserting to Supabase:", error);
            // Revert on error
            todos = todos.filter(t => t.id !== newTodo.id);
            renderTodos();
            alert("Failed to add task to cloud.");
        }
    } else {
        saveLocalTodos(dateStr);
    }
    return newTodo;
}

// Groq AI Integration
async function suggestTaskBreakdownWithAI() {
    const taskText = todoInput.value.trim();
    if (!taskText) {
        alert("먼저 입력창에 할 일을 적은 뒤 마법봉 버튼을 눌러주세요! (예: 자전거 타기)");
        return;
    }

    const groqKey = localStorage.getItem('groq_key');
    if (!groqKey) {
        alert("AI 기능을 사용하려면 우측 하단 ⚙️ 설정에서 Groq API Key를 먼저 입력해주세요.");
        configModal.classList.add('active');
        return;
    }

    aiSuggestBtn.classList.add('loading');
    
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a strict JSON outputting machine. You must ONLY return a valid JSON array of strings representing the subtasks. Do NOT wrap the JSON in markdown blocks (e.g. ```json). Do NOT add any conversational text or greetings. Example format: ["Task 1", "Task 2", "Task 3"]'
                    },
                    {
                        role: 'user',
                        content: `사용자가 '${taskText}' 라는 목표를 달성하려고 합니다. 이 목표를 달성하기 위해 당장 실행할 수 있는 매우 현실적이고, 구체적이며, 실질적인 하위 액션 플랜 3~5가지를 제안해주세요. 결과는 오직 JSON 문자열 배열 포맷으로만 응답하세요.`
                    }
                ],
                temperature: 0.2,
                max_tokens: 250
            })
        });

        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }

        const data = await response.json();
        const suggestionStr = data.choices[0].message.content.trim();
        
        let subTasks = [];
        try {
            let cleanStr = suggestionStr;
            if (cleanStr.startsWith('```json')) {
                cleanStr = cleanStr.replace(/```json/g, '').replace(/```/g, '').trim();
            } else if (cleanStr.startsWith('```')) {
                cleanStr = cleanStr.replace(/```/g, '').trim();
            }
            subTasks = JSON.parse(cleanStr);
            if (!Array.isArray(subTasks)) throw new Error("Not an array");
        } catch (e) {
            console.error("JSON parsing failed, trying fallback regex", e);
            const match = suggestionStr.match(/\[(.*?)\]/s);
            if (match) {
                try {
                    subTasks = JSON.parse(match[0]);
                } catch (err) {
                    console.error("Fallback parsing failed");
                }
            }
        }
        
        if (subTasks.length > 0) {
            todoInput.value = '';
            
            // 상위 목표(최종) 추가
            const parentTodo = await addTodoInternal(`[최종] ${taskText}`);
            
            // 하위 할 일 추가
            for (const subTask of subTasks) {
                await addTodoInternal(subTask, parentTodo.id);
            }
        } else {
            alert("AI가 적절한 하위 할 일을 만들지 못했습니다. 다시 시도해주세요.");
        }
    } catch (error) {
        console.error("AI 에러:", error);
        alert("AI 요청 중 문제가 발생했습니다. API Key를 확인해주세요.");
    } finally {
        aiSuggestBtn.classList.remove('loading');
    }
}

// Toggle Todo
async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newStatus = !todo.is_completed;
    
    // Optimistic UI Update
    todo.is_completed = newStatus;
    renderTodos();

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('todos')
                .update({ is_completed: newStatus })
                .eq('id', id);
                
            if (error) throw error;
        } catch (error) {
            console.error("Error updating Supabase:", error);
            // Revert
            todo.is_completed = !newStatus;
            renderTodos();
        }
    } else {
        saveLocalTodos(getFormattedDateString());
    }
}

// Delete Todo
async function deleteTodo(id) {
    const todoIndex = todos.findIndex(t => t.id === id);
    if (todoIndex === -1) return;

    const deletedTodo = todos[todoIndex];
    
    // Optimistic UI Update
    todos.splice(todoIndex, 1);
    renderTodos();

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('todos')
                .delete()
                .eq('id', id);
                
            if (error) throw error;
        } catch (error) {
            console.error("Error deleting from Supabase:", error);
            // Revert
            todos.splice(todoIndex, 0, deletedTodo);
            renderTodos();
        }
    } else {
        saveLocalTodos(getFormattedDateString());
    }
}

// Local Storage Helpers
function saveLocalTodos(dateStr) {
    localStorage.setItem(`todos_${dateStr}`, JSON.stringify(todos));
}

// Rendering
function renderTodos() {
    todoList.innerHTML = '';

    if (todos.length === 0) {
        todoList.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-list-check'></i>
                <p>No tasks for this day. Enjoy your free time!</p>
            </div>
        `;
        return;
    }

    const mainTodos = todos.filter(t => !t.parent_id);

    mainTodos.forEach(todo => {
        const children = todos.filter(t => t.parent_id === todo.id);
        
        const li = document.createElement('li');
        li.className = `todo-group ${todo.is_completed ? 'completed' : ''}`;
        
        let childrenHTML = '';
        if (children.length > 0) {
            childrenHTML = `
                <div class="sub-todos-container">
                    ${children.map(child => `
                        <div class="sub-todo-item ${child.is_completed ? 'completed' : ''}">
                            <input type="checkbox" class="todo-checkbox sm" ${child.is_completed ? 'checked' : ''} data-id="${child.id}">
                            <div class="todo-content">
                                <span class="todo-text">${escapeHTML(child.task)}</span>
                            </div>
                            <button class="delete-btn sm" data-id="${child.id}" aria-label="Delete Task"><i class='bx bx-x'></i></button>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        li.innerHTML = `
            <div class="todo-item ${children.length > 0 ? 'has-children' : ''}">
                <input type="checkbox" class="todo-checkbox" ${todo.is_completed ? 'checked' : ''} data-id="${todo.id}">
                <div class="todo-content">
                    <span class="todo-text">${escapeHTML(todo.task)}</span>
                    <span class="todo-meta">Added today</span>
                </div>
                <button class="delete-btn" data-id="${todo.id}" aria-label="Delete Task">
                    <i class='bx bx-x'></i>
                </button>
            </div>
            ${childrenHTML}
        `;

        todoList.appendChild(li);
    });

    // Add event listeners to generated elements
    document.querySelectorAll('.todo-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => toggleTodo(e.target.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => toggleTodoWrapDelete(e));
    });
}

function toggleTodoWrapDelete(e) {
    const btn = e.target.closest('.delete-btn');
    if (btn) {
        deleteTodo(btn.dataset.id);
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Run
document.addEventListener('DOMContentLoaded', init);

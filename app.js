// app.js

// State
let currentDate = new Date();
let todos = [];
let supabaseClient = null;

// DOM Elements
const prevDateBtn = document.getElementById('prev-date-btn');
const nextDateBtn = document.getElementById('next-date-btn');
const currentDateDisplay = document.getElementById('current-date-display');
const currentDateFull = document.getElementById('current-date-full');
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
    updateDateDisplay();
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
    prevDateBtn.addEventListener('click', () => changeDate(-1));
    nextDateBtn.addEventListener('click', () => changeDate(1));
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
function changeDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    fetchTodos();
}

function updateDateDisplay() {
    const today = new Date();
    const isToday = 
        currentDate.getDate() === today.getDate() &&
        currentDate.getMonth() === today.getMonth() &&
        currentDate.getFullYear() === today.getFullYear();

    const isYesterday = new Date(today);
    isYesterday.setDate(today.getDate() - 1);
    const isYesterdayMatch = 
        currentDate.getDate() === isYesterday.getDate() &&
        currentDate.getMonth() === isYesterday.getMonth() &&
        currentDate.getFullYear() === isYesterday.getFullYear();

    const isTomorrow = new Date(today);
    isTomorrow.setDate(today.getDate() + 1);
    const isTomorrowMatch = 
        currentDate.getDate() === isTomorrow.getDate() &&
        currentDate.getMonth() === isTomorrow.getMonth() &&
        currentDate.getFullYear() === isTomorrow.getFullYear();

    if (isToday) {
        currentDateDisplay.textContent = "Today";
    } else if (isYesterdayMatch) {
        currentDateDisplay.textContent = "Yesterday";
    } else if (isTomorrowMatch) {
        currentDateDisplay.textContent = "Tomorrow";
    } else {
        currentDateDisplay.textContent = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    }

    currentDateFull.textContent = currentDate.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
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

async function addTodoInternal(task) {
    const dateStr = getFormattedDateString();

    const newTodo = {
        id: crypto.randomUUID(),
        task: task,
        is_completed: false,
        date: dateStr,
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
                messages: [{
                    role: 'user',
                    content: `사용자가 '${taskText}' 라는 할 일을 하려고 합니다. 이것을 실행하기 위한 구체적이고 순차적인 하위 할 일 3~5가지를 제안해주세요. (예를 들어 '샤워하기'라면 '옷 벗기, 물 온도 맞추기, 샴푸하기, 바디워시 하기'). 부가적인 설명(인사말 등)이나 번호 매기기 없이, 오직 하위 할 일들만 쉼표(,)로 구분해서 한국어로 출력하세요.`
                }],
                temperature: 0.7,
                max_tokens: 150
            })
        });

        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }

        const data = await response.json();
        const suggestionStr = data.choices[0].message.content.trim();
        
        const subTasks = suggestionStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        if (subTasks.length > 0) {
            todoInput.value = '';
            for (const subTask of subTasks) {
                await addTodoInternal(subTask);
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

    todos.forEach(todo => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.is_completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.is_completed ? 'checked' : ''} data-id="${todo.id}">
            <span class="todo-text">${escapeHTML(todo.task)}</span>
            <button class="delete-btn" data-id="${todo.id}" aria-label="Delete Task">
                <i class='bx bx-trash'></i>
            </button>
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

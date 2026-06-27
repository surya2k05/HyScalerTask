import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  CheckCircle,
  Circle,
  PlayCircle,
  Clock,
  User,
  UserPlus,
  Plus,
  Search,
  Filter,
  Trash2,
  LogOut,
  ChevronDown,
  ChevronUp,
  Loader,
  AlertCircle,
  Calendar,
  ArrowUpDown,
  MessageSquare,
  Activity,
  Wifi,
  WifiOff,
  Folder,
  CheckSquare,
  Award,
  Users
} from 'lucide-react';
import {
  apiRequest,
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  registerOnTokenRefreshed
} from './api';

export default function App() {
  // Auth State
  const [user, setUser] = useState(null);
  const [accessToken, setAccessTokenState] = useState(null);
  const [authView, setAuthView] = useState('login'); // login, signup
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authErrors, setAuthErrors] = useState({});
  const [authLoading, setAuthLoading] = useState(false);

  // App Navigation View
  const [view, setView] = useState('dashboard'); // dashboard, board
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  // Task Board State
  const [tasks, setTasks] = useState([]);
  const [boardFilters, setBoardFilters] = useState({ search: '', priority: '', assigneeId: '' });
  const [boardLoading, setBoardLoading] = useState(false);

  // Backlog List State (Server-side paginated and sorted)
  const [backlogTasks, setBacklogTasks] = useState([]);
  const [backlogPage, setBacklogPage] = useState(1);
  const [backlogLimit] = useState(8);
  const [backlogTotalPages, setBacklogTotalPages] = useState(1);
  const [backlogTotalTasks, setBacklogTotalTasks] = useState(0);
  const [backlogSort, setBacklogSort] = useState({ sortBy: 'createdAt', sortOrder: 'desc' });
  const [backlogFilters, setBacklogFilters] = useState({ search: '', priority: '', assigneeId: '' });
  const [backlogLoading, setBacklogLoading] = useState(false);

  // Project Activity Feed State
  const [activityFeed, setActivityFeed] = useState([]);

  // Socket State
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Dashboard Stats State
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Modals & Forms State
  const [modals, setModals] = useState({
    createProject: false,
    inviteMember: false,
    createTask: false,
    taskDetails: false
  });
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [projectFormErrors, setProjectFormErrors] = useState({});
  const [inviteForm, setInviteForm] = useState({ email: '' });
  const [inviteFormErrors, setInviteFormErrors] = useState({});
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: '',
    assigneeId: ''
  });
  const [taskFormErrors, setTaskFormErrors] = useState({});
  const [selectedTask, setSelectedTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Active Project Tab
  const [projectTab, setProjectTab] = useState('board'); // board, backlog, activity

  // Toast Notifications State
  const [toasts, setToasts] = useState([]);

  // Drag and drop visual indicator state
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // API Submission loading helpers
  const [actionLoading, setActionLoading] = useState(false);

  // ----------------------------------------------------
  // Toast Helper
  // ----------------------------------------------------
  const showToast = useCallback((type, text) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ----------------------------------------------------
  // Global Session Expiry & Auto Login
  // ----------------------------------------------------
  useEffect(() => {
    // Listen for custom token refresh updates from API client
    registerOnTokenRefreshed(({ accessToken }) => {
      setAccessTokenState(accessToken);
    });

    const handleSessionExpired = () => {
      handleLogout();
      showToast('warning', 'Your session has expired. Please log in again.');
    };

    window.addEventListener('auth-session-expired', handleSessionExpired);

    // Auto login check using Refresh Token
    const attemptAutoLogin = async () => {
      const refToken = getRefreshToken();
      if (refToken) {
        try {
          const res = await fetch('http://localhost:5000/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: refToken }),
          });

          if (res.ok) {
            const data = await res.json();
            setAccessToken(data.accessToken);
            setRefreshToken(data.refreshToken);
            setAccessTokenState(data.accessToken);

            // Fetch user identity
            const userRes = await apiRequest('/dashboard');
            if (userRes.ok) {
              const dashData = await userRes.json();
              // Parse user from assignments or construct from token payload
              const payloadBase64 = data.accessToken.split('.')[1];
              const payload = JSON.parse(atob(payloadBase64));
              setUser({ id: payload.userId, name: payload.name, email: payload.email });
              showToast('success', `Welcome back, ${payload.name}!`);
            }
          } else {
            // invalid refresh token
            setRefreshToken(null);
          }
        } catch (e) {
          console.error('Auto login check failed', e);
        }
      }
    };

    attemptAutoLogin();

    return () => {
      window.removeEventListener('auth-session-expired', handleSessionExpired);
    };
  }, [showToast]);

  // ----------------------------------------------------
  // WebSocket Setup & Orchestration
  // ----------------------------------------------------
  useEffect(() => {
    if (!accessToken) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const socketInstance = io('http://localhost:5000', {
      auth: { token: accessToken },
    });

    socketInstance.on('connect', () => {
      setIsSocketConnected(true);
      if (selectedProjectId) {
        socketInstance.emit('join_project', { projectId: selectedProjectId });
      }
    });

    socketInstance.on('disconnect', () => {
      setIsSocketConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.error('WebSocket Handshake Error:', err.message);
      setIsSocketConnected(false);
    });

    // Real-time Event listeners
    socketInstance.on('task_created', (newTask) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === newTask.id)) return prev;
        return [newTask, ...prev];
      });
      // Force refreshing the backlog view list if currently open
      if (projectTab === 'backlog') {
        fetchBacklogTasks();
      }
      showToast('info', `New task created: "${newTask.title}"`);
    });

    socketInstance.on('task_updated', (updatedTask) => {
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      if (selectedTask?.id === updatedTask.id) {
        setSelectedTask(updatedTask);
      }
      if (projectTab === 'backlog') {
        fetchBacklogTasks();
      }
    });

    socketInstance.on('task_deleted', ({ id }) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTask?.id === id) {
        setSelectedTask(null);
        setModals((prev) => ({ ...prev, taskDetails: false }));
        showToast('warning', 'The task you were viewing has been deleted.');
      }
      if (projectTab === 'backlog') {
        fetchBacklogTasks();
      }
    });

    socketInstance.on('comment_added', ({ taskId, comment }) => {
      if (selectedTask?.id === taskId) {
        setComments((prev) => {
          if (prev.some((c) => c.id === comment.id)) return prev;
          return [...prev, comment];
        });
      }
    });

    socketInstance.on('project_updated', (data) => {
      if (data.action === 'member_added') {
        setSelectedProject((prev) => {
          if (!prev) return null;
          if (prev.members.some((m) => m.id === data.member.id)) return prev;
          return { ...prev, members: [...prev.members, data.member] };
        });
      } else if (data.action === 'member_removed') {
        if (data.userId === user?.id) {
          // You were kicked out
          setSelectedProject(null);
          setSelectedProjectId(null);
          setView('dashboard');
          showToast('warning', 'You have been removed from this project.');
        } else {
          setSelectedProject((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              members: prev.members.filter((m) => m.id !== data.userId),
            };
          });
          // Unassign locally tasks
          setTasks((prev) =>
            prev.map((t) => (t.assigneeId === data.userId ? { ...t, assigneeId: null, assignee: null } : t))
          );
        }
      }
    });

    socketInstance.on('activity_logged', (log) => {
      setActivityFeed((prev) => [log, ...prev]);
    });

    socketInstance.on('assigned_to_me_updated', (data) => {
      const { action, task } = data;
      if (action === 'assigned') {
        showToast('success', `You have been assigned: "${task.title}"`);
      } else if (action === 'unassigned') {
        showToast('warning', `You have been unassigned from: "${task.title}"`);
      }
      if (view === 'dashboard') {
        fetchDashboardStats();
      }
    });

    socketInstance.on('invited_to_project', () => {
      showToast('success', 'You were invited to a new project!');
      if (view === 'dashboard') {
        fetchProjects();
        fetchDashboardStats();
      }
    });

    socketInstance.on('removed_from_project', () => {
      if (view === 'dashboard') {
        fetchProjects();
        fetchDashboardStats();
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [accessToken, selectedProjectId, user?.id, projectTab, selectedTask?.id, view]);

  // ----------------------------------------------------
  // Fetch API Actions
  // ----------------------------------------------------
  const fetchProjects = async () => {
    try {
      const res = await apiRequest('/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error('Fetch projects failed', e);
    }
  };

  const fetchDashboardStats = async () => {
    setDashboardLoading(true);
    try {
      const res = await apiRequest('/dashboard');
      if (res.ok) {
        const data = await res.json();
        setDashboardStats(data);
      }
    } catch (e) {
      console.error('Fetch dashboard stats failed', e);
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchProjectDetails = async (projId) => {
    setBoardLoading(true);
    try {
      const res = await apiRequest(`/projects/${projId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProject(data);
        setTasks(data.tasks);

        // Fetch activity feed
        const actRes = await apiRequest(`/projects/${projId}/activity`);
        if (actRes.ok) {
          const actData = await actRes.json();
          setActivityFeed(actData);
        }

        // Notify socket of current active room
        if (socket) {
          socket.emit('join_project', { projectId: projId });
        }
      } else {
        showToast('warning', 'Failed to retrieve project details.');
        setView('dashboard');
      }
    } catch (e) {
      console.error('Fetch project details failed', e);
      setView('dashboard');
    } finally {
      setBoardLoading(false);
    }
  };

  // Backlog paginated/sorted fetch (Server-side)
  const fetchBacklogTasks = async () => {
    if (!selectedProjectId) return;
    setBacklogLoading(true);
    try {
      const { search, priority, assigneeId } = backlogFilters;
      const { sortBy, sortOrder } = backlogSort;
      let query = `?page=${backlogPage}&limit=${backlogLimit}&sortBy=${sortBy}&sortOrder=${sortOrder}`;

      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (priority) query += `&priority=${priority}`;
      if (assigneeId) query += `&assigneeId=${assigneeId}`;

      const res = await apiRequest(`/projects/${selectedProjectId}/tasks${query}`);
      if (res.ok) {
        const data = await res.json();
        setBacklogTasks(data.tasks);
        setBacklogTotalPages(data.pagination.totalPages);
        setBacklogTotalTasks(data.pagination.totalTasks);
      }
    } catch (e) {
      console.error('Fetch backlog failed', e);
    } finally {
      setBacklogLoading(false);
    }
  };

  // Trigger backlog query refresh on dependency updates
  useEffect(() => {
    if (selectedProjectId && projectTab === 'backlog') {
      fetchBacklogTasks();
    }
  }, [selectedProjectId, projectTab, backlogPage, backlogSort, backlogFilters]);

  // Load basic dashboard states
  useEffect(() => {
    if (accessToken && view === 'dashboard') {
      fetchProjects();
      fetchDashboardStats();
    }
  }, [accessToken, view]);

  // ----------------------------------------------------
  // Auth Form Handlers
  // ----------------------------------------------------
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthErrors({});

    const errors = {};
    if (authView === 'signup' && !authForm.name.trim()) {
      errors.name = 'Name is required.';
    }
    if (!authForm.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email)) {
      errors.email = 'Invalid email format.';
    }
    if (!authForm.password) {
      errors.password = 'Password is required.';
    } else if (authForm.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (!/[a-zA-Z]/.test(authForm.password) || !/[0-9]/.test(authForm.password)) {
      errors.password = 'Password must contain at least 1 letter and 1 number.';
    }

    if (Object.keys(errors).length > 0) {
      setAuthErrors(errors);
      return;
    }

    setAuthLoading(true);
    try {
      const endpoint = authView === 'signup' ? '/auth/signup' : '/auth/login';
      const body =
        authView === 'signup'
          ? { name: authForm.name, email: authForm.email, password: authForm.password }
          : { email: authForm.email, password: authForm.password };

      const res = await fetch(`http://localhost:5000/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        if (authView === 'signup') {
          showToast('success', 'Registration successful! Please log in.');
          setAuthView('login');
          setAuthForm({ name: '', email: authForm.email, password: '' });
        } else {
          setAccessToken(data.accessToken);
          setRefreshToken(data.refreshToken);
          setAccessTokenState(data.accessToken);
          setUser(data.user);
          showToast('success', `Welcome, ${data.user.name}!`);
        }
      } else {
        setAuthErrors({ form: data.error || 'Authentication failed. Please check inputs.' });
      }
    } catch (err) {
      setAuthErrors({ form: 'Server unreachable. Try again later.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const refToken = getRefreshToken();
    if (refToken) {
      try {
        await fetch('http://localhost:5000/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refToken }),
        });
      } catch (e) {
        console.error('Logout request failed', e);
      }
    }

    setAccessToken(null);
    setRefreshToken(null);
    setAccessTokenState(null);
    setUser(null);
    setView('dashboard');
    setSelectedProjectId(null);
    setSelectedProject(null);
    setTasks([]);
  };

  // ----------------------------------------------------
  // CRUD Project Submissions
  // ----------------------------------------------------
  const handleCreateProject = async (e) => {
    e.preventDefault();
    setProjectFormErrors({});
    if (!projectForm.name.trim()) {
      setProjectFormErrors({ name: 'Project name is required' });
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiRequest('/projects', {
        method: 'POST',
        body: JSON.stringify(projectForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', 'Project created successfully!');
        setProjectForm({ name: '', description: '' });
        setModals((m) => ({ ...m, createProject: false }));
        fetchProjects();
        fetchDashboardStats();
      } else {
        setProjectFormErrors({ form: data.error || 'Failed to create project.' });
      }
    } catch (err) {
      setProjectFormErrors({ form: 'Connection error.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm('Are you absolutely sure you want to delete this project? All tasks, memberships, and logs will be permanently deleted.')) return;

    setActionLoading(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('success', 'Project deleted successfully.');
        setView('dashboard');
        setSelectedProjectId(null);
        setSelectedProject(null);
      } else {
        const data = await res.json();
        showToast('warning', data.error || 'Failed to delete project.');
      }
    } catch (err) {
      showToast('warning', 'Connection error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    setInviteFormErrors({});
    if (!inviteForm.email.trim()) {
      setInviteFormErrors({ email: 'Email address is required' });
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/invite`, {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', `User successfully added to project.`);
        setInviteForm({ email: '' });
        setModals((m) => ({ ...m, inviteMember: false }));
        fetchProjectDetails(selectedProjectId);
      } else {
        setInviteFormErrors({ email: data.error || 'Failed to add user.' });
      }
    } catch (err) {
      setInviteFormErrors({ email: 'Connection error.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member? They will lose access to all project assets, and their assigned tasks will be unassigned.')) return;

    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/remove`, {
        method: 'POST',
        body: JSON.stringify({ userId: memberId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', 'Member removed successfully.');
        fetchProjectDetails(selectedProjectId);
      } else {
        showToast('warning', data.error || 'Failed to remove member.');
      }
    } catch (err) {
      showToast('warning', 'Connection error.');
    }
  };

  // ----------------------------------------------------
  // CRUD Task Submissions
  // ----------------------------------------------------
  const handleCreateTask = async (e) => {
    e.preventDefault();
    setTaskFormErrors({});
    if (!taskForm.title.trim()) {
      setTaskFormErrors({ title: 'Task title is required.' });
      return;
    }
    if (taskForm.dueDate) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const selected = new Date(taskForm.dueDate);
      if (selected < today) {
        setTaskFormErrors({ dueDate: 'Due date cannot be in the past.' });
        return;
      }
    }

    setActionLoading(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', 'Task created successfully.');
        setTaskForm({
          title: '',
          description: '',
          status: 'TODO',
          priority: 'MEDIUM',
          dueDate: '',
          assigneeId: ''
        });
        setModals((m) => ({ ...m, createTask: false }));
        // Sockets automatically insert the task, but let's fetch backlog if tab active
        if (projectTab === 'backlog') {
          fetchBacklogTasks();
        }
      } else {
        setTaskFormErrors({ form: data.error || 'Failed to create task.' });
      }
    } catch (err) {
      setTaskFormErrors({ form: 'Connection error.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Role Enforcement check before API request to optimize UI feel
    if (newStatus === 'DONE' && task.status !== 'DONE') {
      const isAssignee = task.assigneeId === user?.id;
      const isOwner = selectedProject?.role === 'OWNER';
      if (!isAssignee && !isOwner) {
        showToast('warning', 'Only the task assignee or project owner can mark this task Done.');
        return;
      }
    }

    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        // updated via WebSockets
      } else {
        showToast('warning', data.error || 'Failed to update task.');
      }
    } catch (err) {
      showToast('warning', 'Connection error updating status.');
    }
  };

  const handleUpdateTaskDetails = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/tasks/${selectedTask.id}`, {
        method: 'PUT',
        body: JSON.stringify(selectedTask),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('success', 'Task updated successfully.');
        setModals((m) => ({ ...m, taskDetails: false }));
      } else {
        showToast('warning', data.error || 'Failed to update task.');
      }
    } catch (err) {
      showToast('warning', 'Connection error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('success', 'Task deleted.');
        setModals((m) => ({ ...m, taskDetails: false }));
      } else {
        const data = await res.json();
        showToast('warning', data.error || 'Failed to delete task.');
      }
    } catch (err) {
      showToast('warning', 'Connection error.');
    }
  };

  // ----------------------------------------------------
  // Comments Handlers
  // ----------------------------------------------------
  const handleFetchComments = async (taskId) => {
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/tasks/${taskId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (e) {
      console.error('Fetch comments failed', e);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setCommentLoading(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: newComment }),
      });
      if (res.ok) {
        setNewComment('');
        // Comments are pushed via websockets in real-time, but fetch comments just in case
        handleFetchComments(selectedTask.id);
      }
    } catch (err) {
      showToast('warning', 'Failed to submit comment.');
    } finally {
      setCommentLoading(false);
    }
  };

  const openTaskModal = (task) => {
    setSelectedTask(task);
    handleFetchComments(task.id);
    setModals((m) => ({ ...m, taskDetails: true }));
  };

  // ----------------------------------------------------
  // HTML5 Drag and Drop Handlers
  // ----------------------------------------------------
  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault();
    setDragOverColumn(columnStatus);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // Check if task status is changing
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== targetStatus) {
      handleUpdateTaskStatus(taskId, targetStatus);
    }
  };

  // ----------------------------------------------------
  // Filtering & Helper logic
  // ----------------------------------------------------
  const getFilteredTasks = () => {
    return tasks.filter((task) => {
      const matchesSearch = task.title.toLowerCase().includes(boardFilters.search.toLowerCase());
      const matchesPriority = boardFilters.priority ? task.priority === boardFilters.priority : true;
      const matchesAssignee = boardFilters.assigneeId
        ? boardFilters.assigneeId === 'unassigned'
          ? !task.assigneeId
          : task.assigneeId === boardFilters.assigneeId
        : true;
      return matchesSearch && matchesPriority && matchesAssignee;
    });
  };

  const handleProjectSelect = (projId) => {
    setSelectedProjectId(projId);
    setView('board');
    setProjectTab('board');
    fetchProjectDetails(projId);
  };

  const toggleBacklogSort = (field) => {
    setBacklogSort((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
    setBacklogPage(1);
  };

  // ----------------------------------------------------
  // Render Components
  // ----------------------------------------------------
  if (!accessToken) {
    return (
      <div className="app-container">
        {/* Toast Overlay */}
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>
              {t.type === 'success' && <CheckCircle size={18} />}
              {t.type === 'warning' && <AlertCircle size={18} />}
              {t.type === 'info' && <Activity size={18} />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>

        <header className="app-header">
          <div className="app-title-group">
            <div className="app-logo">TF</div>
            <h1 className="app-title">TaskFlow</h1>
          </div>
        </header>

        <main className="auth-wrapper">
          <div className="auth-card glass-panel">
            <div className="auth-header">
              <h2>{authView === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p>{authView === 'login' ? 'Sign in to access your projects' : 'Register to start collaborating'}</p>
            </div>

            <form onSubmit={handleAuthSubmit}>
              {authErrors.form && (
                <div className="invalid-feedback" style={{ marginBottom: '1rem', justifyContent: 'center' }}>
                  <AlertCircle size={16} /> {authErrors.form}
                </div>
              )}

              {authView === 'signup' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="name">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    className="form-control"
                    placeholder="Enter your name"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  />
                  {authErrors.name && (
                    <div className="invalid-feedback">
                      <AlertCircle size={14} /> {authErrors.name}
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  className="form-control"
                  placeholder="name@domain.com"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                />
                {authErrors.email && (
                  <div className="invalid-feedback">
                    <AlertCircle size={14} /> {authErrors.email}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
                {authErrors.password && (
                  <div className="invalid-feedback">
                    <AlertCircle size={14} /> {authErrors.password}
                  </div>
                )}
              </div>

              {authView === 'signup' && (
                <p className="form-label" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                  * Password must be at least 8 characters, with at least 1 letter and 1 number.
                </p>
              )}

              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '1.5rem' }} disabled={authLoading}>
                {authLoading ? (
                  <>
                    <Loader size={18} className="spinner" /> Authenticating...
                  </>
                ) : authView === 'login' ? (
                  'Sign In'
                ) : (
                  'Create Account'
                )}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
              {authView === 'login' ? (
                <p>
                  New to TaskFlow?{' '}
                  <button
                    onClick={() => {
                      setAuthView('signup');
                      setAuthErrors({});
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-brand)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Create Account
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setAuthView('login');
                      setAuthErrors({});
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-brand)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Sign In
                  </button>
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast Overlay */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--status-done)' }} />}
            {t.type === 'warning' && <AlertCircle size={18} style={{ color: 'var(--priority-high)' }} />}
            {t.type === 'info' && <Activity size={18} style={{ color: 'var(--color-brand)' }} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Main Header */}
      <header className="app-header">
        <div className="app-title-group" style={{ cursor: 'pointer' }} onClick={() => setView('dashboard')}>
          <div className="app-logo">TF</div>
          <h1 className="app-title">TaskFlow</h1>
          <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: isSocketConnected ? 'var(--status-done)' : 'var(--priority-high)', marginLeft: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.2rem 0.6rem', borderRadius: '50px', border: '1px solid var(--border-glass)' }}>
            {isSocketConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isSocketConnected ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="app-nav">
          {view === 'board' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setView('dashboard')}>
              Back to Dashboard
            </button>
          )}

          <div className="nav-user">
            <div className="user-avatar">{user.name.split(' ').map((n) => n[0]).join('')}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.4rem', border: 'none', background: 'none' }}
              title="Logout"
            >
              <LogOut size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>
      </header>

      {/* Main App Content container */}
      <main className="main-content">
        {/* ==============================================
            DASHBOARD VIEW
            ============================================== */}
        {view === 'dashboard' && (
          <div>
            <div className="dashboard-section-header">
              <h2>My Space Dashboard</h2>
            </div>

            {dashboardLoading ? (
              <div className="spinner-wrapper">
                <div className="spinner"></div>
              </div>
            ) : (
              <div>
                {/* Stats cards row */}
                <div className="dashboard-grid">
                  <div className="stat-card glass-panel">
                    <div className="stat-icon brand">
                      <Folder size={24} />
                    </div>
                    <div className="stat-info">
                      <h3>Active Projects</h3>
                      <div className="stat-number">{dashboardStats?.projectsCount || 0}</div>
                    </div>
                  </div>

                  <div className="stat-card glass-panel">
                    <div className="stat-icon todo">
                      <Circle size={24} />
                    </div>
                    <div className="stat-info">
                      <h3>Assigned To Do</h3>
                      <div className="stat-number">{dashboardStats?.tasksByStatus?.todo || 0}</div>
                    </div>
                  </div>

                  <div className="stat-card glass-panel">
                    <div className="stat-icon progress">
                      <PlayCircle size={24} />
                    </div>
                    <div className="stat-info">
                      <h3>In Progress</h3>
                      <div className="stat-number">{dashboardStats?.tasksByStatus?.inProgress || 0}</div>
                    </div>
                  </div>

                  <div className="stat-card glass-panel">
                    <div className="stat-icon done">
                      <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                      <h3>Completed (Week)</h3>
                      <div className="stat-number">{dashboardStats?.completedDate || dashboardStats?.completedThisWeek || 0}</div>
                    </div>
                  </div>
                </div>

                <div className="dashboard-details">
                  {/* Left Column: Projects lists */}
                  <div>
                    <div className="dashboard-section-header">
                      <h3>Projects I am Member Of</h3>
                      <button className="btn btn-primary btn-sm" onClick={() => setModals((m) => ({ ...m, createProject: true }))}>
                        <Plus size={16} /> New Project
                      </button>
                    </div>

                    {projects.length === 0 ? (
                      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Folder size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p>No active projects found. Create a project to start managing tasks.</p>
                      </div>
                    ) : (
                      <div className="project-list-grid">
                        {projects.map((proj) => (
                          <div
                            key={proj.id}
                            className="project-card glass-panel glass-panel-interactive"
                            onClick={() => handleProjectSelect(proj.id)}
                          >
                            <h3>{proj.name}</h3>
                            <p>{proj.description || 'No description provided.'}</p>
                            <div className="project-card-footer">
                              <span className={`badge ${proj.role === 'OWNER' ? 'badge-high' : 'badge-low'}`}>
                                {proj.role}
                              </span>
                              <div className="member-stack">
                                {proj.members.slice(0, 3).map((m) => (
                                  <div key={m.id} className="member-stack-avatar" title={m.name}>
                                    {m.name.split(' ').map((n) => n[0]).join('')}
                                  </div>
                                ))}
                                {proj.members.length > 3 && (
                                  <div className="member-stack-avatar" style={{ fontSize: '0.65rem' }}>
                                    +{proj.members.length - 3}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Assigned to me list */}
                    <div style={{ marginTop: '2.5rem' }}>
                      <div className="dashboard-section-header">
                        <h3>My Assigned Tasks</h3>
                      </div>
                      {dashboardStats?.assignedTasks?.length === 0 ? (
                        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                          <CheckSquare size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                          No tasks currently assigned to you!
                        </div>
                      ) : (
                        <div className="glass-panel" style={{ overflow: 'hidden' }}>
                          <table className="backlog-table" style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Task Title</th>
                                <th>Project</th>
                                <th>Status</th>
                                <th>Priority</th>
                                <th>Due Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dashboardStats?.assignedTasks?.map((task) => (
                                <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => handleProjectSelect(task.projectId)}>
                                  <td><strong>{task.title}</strong></td>
                                  <td>{task.project?.name}</td>
                                  <td>
                                    <span style={{ fontSize: '0.8rem', padding: '0.15rem 0.5rem', borderRadius: '50px', fontWeight: 600, background: task.status === 'DONE' ? 'var(--status-done-bg)' : task.status === 'IN_PROGRESS' ? 'var(--status-progress-bg)' : 'var(--status-todo-bg)', color: task.status === 'DONE' ? 'var(--status-done)' : task.status === 'IN_PROGRESS' ? 'var(--status-progress)' : 'var(--status-todo)' }}>
                                      {task.status}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`badge badge-${task.priority.toLowerCase()}`}>{task.priority}</span>
                                  </td>
                                  <td>
                                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Global feeds & analytics */}
                  <div>
                    {dashboardStats?.projectWithMostOpenTasks && (
                      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--priority-medium)' }}>
                        <Award size={28} style={{ color: 'var(--priority-medium)' }} />
                        <div>
                          <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Project to Watch</h4>
                          <p style={{ fontSize: '1rem', fontWeight: 600 }}>{dashboardStats.projectWithMostOpenTasks.name}</p>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <strong>{dashboardStats.projectWithMostOpenTasks.openTasksCount}</strong> open tasks
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                      <div className="dashboard-section-header" style={{ marginBottom: '1rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                          <Activity size={18} /> Global Activity Feed
                        </h3>
                      </div>
                      <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                        {dashboardStats?.recentActivity?.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>No recent activities logged.</p>
                        ) : (
                          <div className="activity-feed">
                            {dashboardStats?.recentActivity?.map((log) => (
                              <div key={log.id} className="activity-item">
                                <div className="activity-icon-container">
                                  <Activity size={14} />
                                </div>
                                <div className="activity-body">
                                  <div className="activity-text">
                                    <strong>{log.user.name}</strong> {log.details}
                                  </div>
                                  <span className="activity-date">
                                    {new Date(log.createdAt).toLocaleString()} • {log.project.name}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==============================================
            PROJECT BOARD VIEW
            ============================================== */}
        {view === 'board' && selectedProject && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Project Title Bar */}
            <div className="board-header">
              <div className="board-header-left">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{selectedProject.name}</h2>
                  <span className={`badge ${selectedProject.role === 'OWNER' ? 'badge-high' : 'badge-low'}`}>
                    {selectedProject.role}
                  </span>
                </div>
                <p className="board-description">{selectedProject.description || 'No project description.'}</p>
              </div>

              <div className="board-controls">
                {selectedProject.role === 'OWNER' && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setModals((m) => ({ ...m, inviteMember: true }))}>
                      <UserPlus size={16} /> Invite Member
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleDeleteProject} disabled={actionLoading}>
                      <Trash2 size={16} /> Delete Project
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Project Tabs Selection */}
            <div className="tabs-header">
              <button
                className={`tab-btn ${projectTab === 'board' ? 'active' : ''}`}
                onClick={() => setProjectTab('board')}
              >
                Kanban Board
              </button>
              <button
                className={`tab-btn ${projectTab === 'backlog' ? 'active' : ''}`}
                onClick={() => {
                  setProjectTab('backlog');
                  setBacklogPage(1);
                  fetchBacklogTasks();
                }}
              >
                Backlog (List View)
              </button>
              <button
                className={`tab-btn ${projectTab === 'activity' ? 'active' : ''}`}
                onClick={() => setProjectTab('activity')}
              >
                Project Log Feed
              </button>
              <button
                className={`tab-btn ${projectTab === 'members' ? 'active' : ''}`}
                onClick={() => setProjectTab('members')}
              >
                Members ({selectedProject.members.length})
              </button>
            </div>

            {/* TAB CONTENT: KANBAN BOARD */}
            {projectTab === 'board' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* Board Column Filters */}
                <div className="filter-bar glass-panel">
                  <div className="search-input-wrapper">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search tasks by title..."
                      value={boardFilters.search}
                      onChange={(e) => setBoardFilters({ ...boardFilters, search: e.target.value })}
                    />
                  </div>

                  <select
                    className="form-control filter-select"
                    value={boardFilters.priority}
                    onChange={(e) => setBoardFilters({ ...boardFilters, priority: e.target.value })}
                  >
                    <option value="">All Priorities</option>
                    <option value="LOW">Low Priority</option>
                    <option value="MEDIUM">Medium Priority</option>
                    <option value="HIGH">High Priority</option>
                  </select>

                  <select
                    className="form-control filter-select"
                    value={boardFilters.assigneeId}
                    onChange={(e) => setBoardFilters({ ...boardFilters, assigneeId: e.target.value })}
                  >
                    <option value="">All Assignees</option>
                    <option value="unassigned">Unassigned Only</option>
                    {selectedProject.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <button className="btn btn-primary btn-sm" onClick={() => setModals((m) => ({ ...m, createTask: true }))}>
                    <Plus size={16} /> Create Task
                  </button>
                </div>

                {boardLoading ? (
                  <div className="spinner-wrapper">
                    <div className="spinner"></div>
                  </div>
                ) : (
                  <div className="kanban-board">
                    {/* TO DO COLUMN */}
                    <div
                      className={`kanban-column ${dragOverColumn === 'TODO' ? 'drag-over' : ''}`}
                      onDragOver={(e) => handleDragOver(e, 'TODO')}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'TODO')}
                    >
                      <div className="column-header">
                        <div className="column-title">
                          <span className="column-indicator todo"></span>
                          To Do
                        </div>
                        <span className="task-count-badge">
                          {getFilteredTasks().filter((t) => t.status === 'TODO').length}
                        </span>
                      </div>

                      <div className="task-list">
                        {getFilteredTasks()
                          .filter((t) => t.status === 'TODO')
                          .map((task) => (
                            <div
                              key={task.id}
                              className="task-card glass-panel glass-panel-interactive"
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => openTaskModal(task)}
                            >
                              <div className="task-card-header">
                                <span className={`badge badge-${task.priority.toLowerCase()}`}>{task.priority}</span>
                                {task.comments?.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    <MessageSquare size={12} /> {task.comments.length}
                                  </div>
                                )}
                              </div>
                              <h4>{task.title}</h4>
                              <p className="task-card-desc">{task.description}</p>
                              <div className="task-card-footer">
                                <div className="task-card-date">
                                  <Calendar size={12} />
                                  <span>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}</span>
                                </div>
                                <div className="task-card-assignee">
                                  {task.assignee ? (
                                    <div className="assignee-avatar" title={task.assignee.name}>
                                      {task.assignee.name.split(' ').map((n) => n[0]).join('')}
                                    </div>
                                  ) : (
                                    <div className="assignee-avatar unassigned" title="Unassigned">-</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* IN PROGRESS COLUMN */}
                    <div
                      className={`kanban-column ${dragOverColumn === 'IN_PROGRESS' ? 'drag-over' : ''}`}
                      onDragOver={(e) => handleDragOver(e, 'IN_PROGRESS')}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'IN_PROGRESS')}
                    >
                      <div className="column-header">
                        <div className="column-title">
                          <span className="column-indicator progress"></span>
                          In Progress
                        </div>
                        <span className="task-count-badge">
                          {getFilteredTasks().filter((t) => t.status === 'IN_PROGRESS').length}
                        </span>
                      </div>

                      <div className="task-list">
                        {getFilteredTasks()
                          .filter((t) => t.status === 'IN_PROGRESS')
                          .map((task) => (
                            <div
                              key={task.id}
                              className="task-card glass-panel glass-panel-interactive"
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => openTaskModal(task)}
                            >
                              <div className="task-card-header">
                                <span className={`badge badge-${task.priority.toLowerCase()}`}>{task.priority}</span>
                                {task.comments?.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    <MessageSquare size={12} /> {task.comments.length}
                                  </div>
                                )}
                              </div>
                              <h4>{task.title}</h4>
                              <p className="task-card-desc">{task.description}</p>
                              <div className="task-card-footer">
                                <div className="task-card-date">
                                  <Calendar size={12} />
                                  <span>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}</span>
                                </div>
                                <div className="task-card-assignee">
                                  {task.assignee ? (
                                    <div className="assignee-avatar" title={task.assignee.name}>
                                      {task.assignee.name.split(' ').map((n) => n[0]).join('')}
                                    </div>
                                  ) : (
                                    <div className="assignee-avatar unassigned" title="Unassigned">-</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* DONE COLUMN */}
                    <div
                      className={`kanban-column ${dragOverColumn === 'DONE' ? 'drag-over' : ''}`}
                      onDragOver={(e) => handleDragOver(e, 'DONE')}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'DONE')}
                    >
                      <div className="column-header">
                        <div className="column-title">
                          <span className="column-indicator done"></span>
                          Done
                        </div>
                        <span className="task-count-badge">
                          {getFilteredTasks().filter((t) => t.status === 'DONE').length}
                        </span>
                      </div>

                      <div className="task-list">
                        {getFilteredTasks()
                          .filter((t) => t.status === 'DONE')
                          .map((task) => (
                            <div
                              key={task.id}
                              className="task-card glass-panel glass-panel-interactive"
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => openTaskModal(task)}
                            >
                              <div className="task-card-header">
                                <span className={`badge badge-${task.priority.toLowerCase()}`}>{task.priority}</span>
                                {task.comments?.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    <MessageSquare size={12} /> {task.comments.length}
                                  </div>
                                )}
                              </div>
                              <h4 style={{ textDecoration: 'line-through', opacity: 0.7 }}>{task.title}</h4>
                              <p className="task-card-desc">{task.description}</p>
                              <div className="task-card-footer">
                                <div className="task-card-date">
                                  <CheckCircle size={12} style={{ color: 'var(--status-done)' }} />
                                  <span style={{ color: 'var(--status-done)' }}>Done</span>
                                </div>
                                <div className="task-card-assignee">
                                  {task.assignee ? (
                                    <div className="assignee-avatar" title={task.assignee.name}>
                                      {task.assignee.name.split(' ').map((n) => n[0]).join('')}
                                    </div>
                                  ) : (
                                    <div className="assignee-avatar unassigned" title="Unassigned">-</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: SERVER-SIDE BACKLOG LIST */}
            {projectTab === 'backlog' && (
              <div className="backlog-view">
                {/* Backlog filter row */}
                <div className="filter-bar glass-panel">
                  <div className="search-input-wrapper">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search title..."
                      value={backlogFilters.search}
                      onChange={(e) => {
                        setBacklogFilters({ ...backlogFilters, search: e.target.value });
                        setBacklogPage(1);
                      }}
                    />
                  </div>

                  <select
                    className="form-control filter-select"
                    value={backlogFilters.priority}
                    onChange={(e) => {
                      setBacklogFilters({ ...backlogFilters, priority: e.target.value });
                      setBacklogPage(1);
                    }}
                  >
                    <option value="">All Priorities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>

                  <select
                    className="form-control filter-select"
                    value={backlogFilters.assigneeId}
                    onChange={(e) => {
                      setBacklogFilters({ ...backlogFilters, assigneeId: e.target.value });
                      setBacklogPage(1);
                    }}
                  >
                    <option value="">All Assignees</option>
                    <option value="unassigned">Unassigned</option>
                    {selectedProject.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {backlogLoading ? (
                  <div className="spinner-wrapper">
                    <div className="spinner"></div>
                  </div>
                ) : (
                  <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <table className="backlog-table">
                      <thead>
                        <tr>
                          <th onClick={() => toggleBacklogSort('title')}>
                            Title <ArrowUpDown size={14} style={{ display: 'inline', marginLeft: '4px' }} />
                          </th>
                          <th onClick={() => toggleBacklogSort('status')}>
                            Status <ArrowUpDown size={14} style={{ display: 'inline', marginLeft: '4px' }} />
                          </th>
                          <th onClick={() => toggleBacklogSort('priority')}>
                            Priority <ArrowUpDown size={14} style={{ display: 'inline', marginLeft: '4px' }} />
                          </th>
                          <th onClick={() => toggleBacklogSort('dueDate')}>
                            Due Date <ArrowUpDown size={14} style={{ display: 'inline', marginLeft: '4px' }} />
                          </th>
                          <th onClick={() => toggleBacklogSort('createdAt')}>
                            Created At <ArrowUpDown size={14} style={{ display: 'inline', marginLeft: '4px' }} />
                          </th>
                          <th>Assignee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backlogTasks.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                              No tasks match filters in backlog.
                            </td>
                          </tr>
                        ) : (
                          backlogTasks.map((task) => (
                            <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => openTaskModal(task)}>
                              <td><strong>{task.title}</strong></td>
                              <td>
                                <span style={{ fontSize: '0.8rem', padding: '0.15rem 0.5rem', borderRadius: '50px', fontWeight: 600, background: task.status === 'DONE' ? 'var(--status-done-bg)' : task.status === 'IN_PROGRESS' ? 'var(--status-progress-bg)' : 'var(--status-todo-bg)', color: task.status === 'DONE' ? 'var(--status-done)' : task.status === 'IN_PROGRESS' ? 'var(--status-progress)' : 'var(--status-todo)' }}>
                                  {task.status}
                                </span>
                              </td>
                              <td>
                                <span className={`badge badge-${task.priority.toLowerCase()}`}>{task.priority}</span>
                              </td>
                              <td>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}</td>
                              <td>{new Date(task.createdAt).toLocaleDateString()}</td>
                              <td>
                                {task.assignee ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div className="assignee-avatar">{task.assignee.name.split(' ').map((n) => n[0]).join('')}</div>
                                    <span>{task.assignee.name}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    <div className="backlog-pagination">
                      <div>
                        Showing Page {backlogPage} of {backlogTotalPages || 1} ({backlogTotalTasks} tasks total)
                      </div>
                      <div className="pagination-controls">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setBacklogPage((p) => Math.max(1, p - 1))}
                          disabled={backlogPage === 1}
                        >
                          Prev
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setBacklogPage((p) => Math.min(backlogTotalPages, p + 1))}
                          disabled={backlogPage >= backlogTotalPages}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: ACTIVITY FEED */}
            {projectTab === 'activity' && (
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={18} /> Project Activity Feed
                </h3>
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {activityFeed.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>No project events recorded.</p>
                  ) : (
                    <div className="activity-feed">
                      {activityFeed.map((log) => (
                        <div key={log.id} className="activity-item">
                          <div className="activity-icon-container">
                            <Activity size={14} />
                          </div>
                          <div>
                            <div className="activity-text">
                              <strong>{log.user?.name || 'System'}</strong> {log.details}
                            </div>
                            <span className="activity-date">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: MEMBERS */}
            {projectTab === 'members' && (
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <div className="dashboard-section-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={18} /> Project Members</h3>
                  {selectedProject.role === 'OWNER' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setModals((m) => ({ ...m, inviteMember: true }))}>
                      <UserPlus size={16} /> Invite Member
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                  {selectedProject.members.map((member) => (
                    <div key={member.id} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="user-avatar">{member.name.split(' ').map((n) => n[0]).join('')}</div>
                        <div>
                          <p style={{ fontWeight: 600 }}>{member.name}</p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{member.email}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className={`badge ${member.role === 'OWNER' ? 'badge-high' : 'badge-low'}`}>
                          {member.role}
                        </span>
                        {selectedProject.role === 'OWNER' && member.id !== user.id && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.35rem' }}
                            title="Remove Member"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ==============================================
          MODALS & FORM POPUPS
          ============================================== */}

      {/* MODAL: CREATE PROJECT */}
      {modals.createProject && (
        <div className="modal-overlay" onClick={() => setModals((m) => ({ ...m, createProject: false }))}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Project</h3>
              <button className="modal-close-btn" onClick={() => setModals((m) => ({ ...m, createProject: false }))}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              {projectFormErrors.form && (
                <div className="invalid-feedback" style={{ marginBottom: '1rem' }}>
                  <AlertCircle size={14} /> {projectFormErrors.form}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Acme Platform Migration"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                />
                {projectFormErrors.name && (
                  <div className="invalid-feedback">
                    <AlertCircle size={14} /> {projectFormErrors.name}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Project Description</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Outline the goals and deliverables..."
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                ></textarea>
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Create Project'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INVITE MEMBER */}
      {modals.inviteMember && (
        <div className="modal-overlay" onClick={() => setModals((m) => ({ ...m, inviteMember: false }))}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invite Member to Project</h3>
              <button className="modal-close-btn" onClick={() => setModals((m) => ({ ...m, inviteMember: false }))}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Enter the email address of a registered user to invite them as a member of this project.
            </p>
            <form onSubmit={handleInviteMember}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="member@example.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                />
                {inviteFormErrors.email && (
                  <div className="invalid-feedback">
                    <AlertCircle size={14} /> {inviteFormErrors.email}
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={actionLoading}>
                {actionLoading ? 'Inviting...' : 'Send Invitation'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE TASK */}
      {modals.createTask && (
        <div className="modal-overlay" onClick={() => setModals((m) => ({ ...m, createTask: false }))}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Task</h3>
              <button className="modal-close-btn" onClick={() => setModals((m) => ({ ...m, createTask: false }))}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              {taskFormErrors.form && (
                <div className="invalid-feedback" style={{ marginBottom: '1rem' }}>
                  <AlertCircle size={14} /> {taskFormErrors.form}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Design signup form mockups"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                />
                {taskFormErrors.title && (
                  <div className="invalid-feedback">
                    <AlertCircle size={14} /> {taskFormErrors.title}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Task Description</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Detail the steps required..."
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                ></textarea>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-control"
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-control"
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Assignee</label>
                  <select
                    className="form-control"
                    value={taskForm.assigneeId}
                    onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {selectedProject.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  />
                  {taskFormErrors.dueDate && (
                    <div className="invalid-feedback">
                      <AlertCircle size={14} /> {taskFormErrors.dueDate}
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '1rem' }} disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Create Task'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TASK DETAIL & COMMENT FLOW */}
      {modals.taskDetails && selectedTask && (
        <div className="modal-overlay" onClick={() => setModals((m) => ({ ...m, taskDetails: false }))}>
          <div className="modal-content glass-panel" style={{ maxWidth: '750px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '1rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Task Details
              </h3>
              <button className="modal-close-btn" onClick={() => setModals((m) => ({ ...m, taskDetails: false }))}>
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateTaskDetails}>
              <div className="task-details-grid">
                {/* Main side */}
                <div className="task-info-main">
                  <div className="form-group">
                    <label className="form-label">Title</label>
                    <input
                      type="text"
                      className="form-control"
                      style={{ fontWeight: 600 }}
                      value={selectedTask.title}
                      onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows="4"
                      value={selectedTask.description || ''}
                      onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                    ></textarea>
                  </div>
                </div>

                {/* Sidebar details */}
                <div className="task-info-sidebar">
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-control"
                      value={selectedTask.status}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        // Client side role checks for Done
                        if (newStatus === 'DONE' && selectedTask.status !== 'DONE') {
                          const isAssignee = selectedTask.assigneeId === user?.id;
                          const isOwner = selectedProject?.role === 'OWNER';
                          if (!isAssignee && !isOwner) {
                            showToast('warning', 'Only the assignee or project owner can mark this task Done.');
                            return;
                          }
                        }
                        setSelectedTask({ ...selectedTask, status: newStatus });
                      }}
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="DONE">Done</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select
                      className="form-control"
                      value={selectedTask.priority}
                      onChange={(e) => setSelectedTask({ ...selectedTask, priority: e.target.value })}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assignee</label>
                    <select
                      className="form-control"
                      value={selectedTask.assigneeId || ''}
                      onChange={(e) => setSelectedTask({ ...selectedTask, assigneeId: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {selectedProject.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={selectedTask.dueDate ? selectedTask.dueDate.split('T')[0] : ''}
                      onChange={(e) => setSelectedTask({ ...selectedTask, dueDate: e.target.value || null })}
                    />
                  </div>

                  {selectedTask.completedDate && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--status-done)', padding: '0.5rem', background: 'var(--status-done-bg)', borderRadius: 'var(--radius-sm)' }}>
                      <strong>Completed:</strong> {new Date(selectedTask.completedDate).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                >
                  <Trash2 size={16} /> Delete Task
                </button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setModals((m) => ({ ...m, taskDetails: false }))}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    {actionLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>

            {/* Comments List & Input */}
            <div className="comments-section">
              <h4 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={16} /> Comments ({comments.length})
              </h4>

              <div className="comments-list">
                {comments.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                    No comments yet. Write a comment to notify the team.
                  </p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="comment-item">
                      <div className="user-avatar" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.75rem' }}>
                        {comment.user.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div className="comment-body">
                        <div className="comment-meta">
                          <span className="comment-author">{comment.user.name}</span>
                          <span className="comment-date">{new Date(comment.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="comment-text">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="comment-form">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Post a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={commentLoading}>
                  {commentLoading ? 'Posting...' : 'Comment'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

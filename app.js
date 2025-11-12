// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  initializeTheme();
  initializeApp();
});

// Theme Management
function initializeTheme() {
  // Set dark theme as default
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  
  // Setup theme toggle
  setupThemeToggle();
}

function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    showToast(`Switched to ${newTheme} theme`, 'info');
  });
}

function updateThemeIcon(theme) {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  
  const icon = themeToggle.querySelector('i');
  if (theme === 'dark') {
    icon.className = 'fas fa-sun';
  } else {
    icon.className = 'fas fa-moon';
  }
}

function initializeApp() {
  updateDateTime();
  setInterval(updateDateTime, 60000); // Update every minute
  
  setupNavigation();
  setupEventListeners();
  setupModalHandlers();
  setupMobileMenu();
  
  // Add fade-in animation to main content
  document.querySelector('.main-content').classList.add('fade-in');
}

// Update date and time in header
function updateDateTime() {
  const dateTimeElement = document.getElementById('current-date');
  const now = new Date();
  
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  const formattedDate = now.toLocaleDateString('en-US', options);
  dateTimeElement.textContent = formattedDate.replace(' at ', ' • ');
}

// Setup navigation between sections
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const contentSections = document.querySelectorAll('.content-section');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active class from all nav items
      navItems.forEach(navItem => navItem.classList.remove('active'));
      
      // Add active class to clicked item
      item.classList.add('active');
      
      // Hide all content sections
      contentSections.forEach(section => section.classList.add('hidden'));
      
      // Show target section
      const targetTab = item.getAttribute('data-tab');
      const targetSection = document.getElementById(targetTab);
      if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('slide-in');
        
        // Remove animation class after animation completes
        setTimeout(() => {
          targetSection.classList.remove('slide-in');
        }, 300);
      }
    });
  });
}

// Setup event listeners for buttons and interactions
function setupEventListeners() {
  // Meet Now button
  document.getElementById('meet-now')?.addEventListener('click', () => {
    simulateMeetingStart('instant');
  });
  
  // Schedule Meeting button
  document.getElementById('schedule-meeting')?.addEventListener('click', () => {
    openModal('meeting-modal');
  });
  
  // Broadcast Now button
  document.getElementById('broadcast-now')?.addEventListener('click', () => {
    simulateWebinarStart('instant');
  });
  
  // Schedule Webinar button
  document.getElementById('schedule-webinar')?.addEventListener('click', () => {
    openModal('meeting-modal');
  });
  
  // Start Meeting button
  document.getElementById('start-meeting')?.addEventListener('click', () => {
    simulateMeetingStart('personal-room');
  });
  
  // Copy URL button
  document.getElementById('copy-url')?.addEventListener('click', () => {
    copyToClipboard('https://meet.buzzmeet.com/personal-room-xyz');
  });
  
  // Buy Now button
  document.querySelector('.btn-buy-now')?.addEventListener('click', () => {
    showToast('Redirecting to billing...', 'info');
  });
  
  // Department dropdown
  document.querySelector('.department-dropdown')?.addEventListener('click', () => {
    showToast('Department selection coming soon...', 'info');
  });
  
  // Apps menu
  document.querySelector('.apps-menu')?.addEventListener('click', () => {
    showToast('Apps menu coming soon...', 'info');
  });
}

// Mobile menu functionality
function setupMobileMenu() {
  // Add mobile menu button to header if it doesn't exist
  const headerLeft = document.querySelector('.header-left');
  if (headerLeft && !document.querySelector('.mobile-menu-btn')) {
    const menuBtn = document.createElement('button');
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
    headerLeft.insertBefore(menuBtn, headerLeft.firstChild);
    
    // Add event listener
    menuBtn.addEventListener('click', toggleMobileMenu);
  }
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const menuBtn = document.querySelector('.mobile-menu-btn');
    
    if (sidebar && sidebar.classList.contains('open') && 
        !sidebar.contains(e.target) && 
        !menuBtn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
  
  // Close menu when selecting nav item on mobile
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
      }
    });
  });
}

function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('open');
}

// Modal handling
function setupModalHandlers() {
  const modal = document.getElementById('meeting-modal');
  const closeBtn = modal?.querySelector('.close-modal');
  const cancelBtn = modal?.querySelector('.cancel-btn');
  const form = modal?.querySelector('#meeting-form');
  
  closeBtn?.addEventListener('click', () => closeModal('meeting-modal'));
  cancelBtn?.addEventListener('click', () => closeModal('meeting-modal'));
  
  // Close modal when clicking outside
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal('meeting-modal');
    }
  });
  
  // Handle form submission
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleMeetingSchedule(form);
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('meeting-modal');
    }
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('fade-in');
    
    // Focus on first input
    const firstInput = modal.querySelector('input');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('fade-in');
  }
}

function handleMeetingSchedule(form) {
  const formData = new FormData(form);
  const meetingData = {
    title: form.querySelector('input[type="text"]').value,
    datetime: form.querySelector('input[type="datetime-local"]').value,
    description: form.querySelector('textarea').value
  };
  
  // Simulate API call
  showLoading();
  
  setTimeout(() => {
    hideLoading();
    closeModal('meeting-modal');
    showToast(`Meeting "${meetingData.title}" scheduled successfully!`, 'success');
    
    // Reset form
    form.reset();
  }, 1500);
}

// Simulate meeting start
function simulateMeetingStart(type) {
  const messages = {
    'instant': 'Starting instant meeting...',
    'personal-room': 'Joining personal room...'
  };
  
  showLoading();
  showToast(messages[type], 'info');
  
  setTimeout(() => {
    hideLoading();
    showToast('Meeting room ready! 🎥', 'success');
  }, 2000);
}

// Simulate webinar start
function simulateWebinarStart(type) {
  showLoading();
  showToast('Preparing webinar broadcast...', 'info');
  
  setTimeout(() => {
    hideLoading();
    showToast('Webinar broadcast started! 📺', 'success');
  }, 2000);
}

// Copy to clipboard functionality
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('URL copied to clipboard!', 'success');
    }).catch(() => {
      fallbackCopyToClipboard(text);
    });
  } else {
    fallbackCopyToClipboard(text);
  }
}

function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
    showToast('URL copied to clipboard!', 'success');
  } catch (err) {
    showToast('Failed to copy URL', 'error');
  }
  
  document.body.removeChild(textArea);
}

// Toast notifications
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, 3000);
}

// Loading states
function showLoading() {
  const buttons = document.querySelectorAll('.btn-primary, .btn-secondary');
  buttons.forEach(btn => {
    if (!btn.querySelector('.loading')) {
      btn.disabled = true;
      btn.style.opacity = '0.7';
      
      const originalText = btn.textContent;
      btn.setAttribute('data-original-text', originalText);
      
      const loader = document.createElement('span');
      loader.className = 'loading';
      btn.innerHTML = '';
      btn.appendChild(loader);
    }
  });
}

function hideLoading() {
  const buttons = document.querySelectorAll('.btn-primary, .btn-secondary');
  buttons.forEach(btn => {
    const originalText = btn.getAttribute('data-original-text');
    if (originalText) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = originalText;
      btn.removeAttribute('data-original-text');
    }
  });
}

// Settings handlers
function setupSettingsHandlers() {
  const toggles = document.querySelectorAll('.toggle input[type="checkbox"]');
  
  toggles.forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const setting = e.target.nextElementSibling.textContent;
      const isEnabled = e.target.checked;
      
      showToast(`${setting} ${isEnabled ? 'enabled' : 'disabled'}`, 'info');
    });
  });
}

// Mobile sidebar toggle (for future enhancement)
function setupMobileSidebar() {
  // This would be for mobile menu toggle functionality
  const menuButton = document.querySelector('.mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  
  if (menuButton && sidebar) {
    menuButton.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + M for new meeting
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
    e.preventDefault();
    simulateMeetingStart('instant');
  }
  
  // Ctrl/Cmd + S for schedule
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    openModal('meeting-modal');
  }
});

// Error handling
window.addEventListener('error', (e) => {
  console.error('Application error:', e.error);
  showToast('Something went wrong. Please refresh the page.', 'error');
});

// Initialize additional features
setTimeout(() => {
  setupSettingsHandlers();
}, 1000);

// Handle window resize
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    document.querySelector('.sidebar').classList.remove('open');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Toggle theme with Ctrl/Cmd + T
  if ((e.ctrlKey || e.metaKey) && e.key === 't') {
    e.preventDefault();
    document.getElementById('theme-toggle')?.click();
  }
  
  // Toggle mobile menu with Escape
  if (e.key === 'Escape') {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
  }
});
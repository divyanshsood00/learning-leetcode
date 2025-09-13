// popup.ts

// Global state
let timerInterval: number | null = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  loadActiveTabData();
  initializeAllButtons();
});

// Clean up when popup unloads
window.addEventListener('unload', () => {
  cleanup();
});

async function loadActiveTabData(): Promise<void> {
  const loadingEl = document.getElementById('loading')!;
  const contentEl = document.getElementById('content')!;
  const errorEl = document.getElementById('error')!;

  function setError(message: string): void {
    loadingEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorEl.textContent = message;
  }

  function showContent(): void {
    loadingEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
  }

  try {
    const tabs = await queryActiveTab();
    const tab = tabs && tabs[0];
    
    if (!tab) {
      setError('No active tab found.');
      startTimerLoop(null);
      return;
    }

    const response = await sendMessageToTab(tab.id!, { action: 'getProblemData' });

    if (chrome.runtime.lastError) {
      setError(
        'Cannot reach page script. Make sure you are on a LeetCode problem page (https://leetcode.com/problems/...).\n\n' + 
        chrome.runtime.lastError.message
      );
      startTimerLoop(tab.id!);
      return;
    }

    if (!response || !response.success) {
      const errorMsg = response?.error ? ` Error: ${response.error}` : '';
      setError('Failed to extract data from the page.' + errorMsg);
      startTimerLoop(tab.id!);
      return;
    }

    updateUI(response.data || {}, tab);
    showContent();
    startTimerLoop(tab.id!);
  } catch (error) {
    setError('An unexpected error occurred: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

function queryActiveTab(): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs);
    });
  });
}

function sendMessageToTab(tabId: number, message: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: any) => {
      resolve(response);
    });
  });
}

function updateUI(data: any, tab: chrome.tabs.Tab): void {
  updateElement('title', data.title || '—');
  updateElement('difficulty', data.difficulty || '—');
  updateElement('problemType', data.problemType || '—');
  updateElement('description', data.description || '(no description found)');
  updateElement('tabActive', tab.active ? 'Yes' : 'No');
  updateElement('pageVisible', data.isVisible ? 'Yes (visible)' : 'No (hidden/inactive)');
  
  // Update tags with clickable elements
  updateTags(data.tags || []);
}

function updateTags(tags: string[]): void {
  const tagsContainer = document.getElementById('tags');
  if (!tagsContainer) return;

  if (tags.length === 0) {
    tagsContainer.innerHTML = '<span style="color: #718096; font-style: italic;">No tags found</span>';
    return;
  }

  tagsContainer.innerHTML = '';
  tags.forEach(tag => {
    const tagEl = document.createElement('div');
    tagEl.className = 'tag';
    tagEl.textContent = tag;
    tagEl.addEventListener('click', () => getRandomRecommendationByTag(tag));
    tagsContainer.appendChild(tagEl);
  });
}

function updateElement(id: string, text: string): void {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

/**
 * Timer display logic
 *
 * Compatibility:
 * - If chrome.storage.local has a "tabTimers" object (MV3 friendly format) we read:
 *     tabTimers = { "<tabId>": { accumulated: number(ms), runningSince: number|null(ms) }, ... }
 *   and compute elapsed = accumulated + (runningSince ? Date.now() - runningSince : 0)
 *
 * - If storage contains a numeric value under the tabId key (legacy/simple format),
 *   we treat that value as **seconds** and display it directly.
 *
 * If tabId is null or something fails we display '—'.
 */
function startTimerLoop(activeTabId: number | null): void {
  // Clear any previous interval
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // If no activeTabId provided, try to query it once
  if (!activeTabId) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const id = tab ? tab.id : null;
      updateTimeForTab(id || null);
      timerInterval = setInterval(() => updateTimeForTab(id || null), 1000);
    });
    return;
  }

  // Start the periodic update for the provided tabId
  updateTimeForTab(activeTabId);
  timerInterval = setInterval(() => updateTimeForTab(activeTabId), 1000);
}

function updateTimeForTab(tabId: number | null): void {
  const timeEl = document.getElementById('time');
  if (!timeEl) return;

  if (!tabId) {
    timeEl.textContent = '—';
    return;
  }

  const tabKey = String(tabId);

  // Request the correct storage keys: 'titleTimers' and 'tabToTitle'
  chrome.storage.local.get(['titleTimers', 'tabToTitle'], (res: any) => {
    if (chrome.runtime.lastError) {
      // If storage fails, show fallback
      timeEl.textContent = '—';
      return;
    }

    // Get the title for this tab
    const title = res.tabToTitle && res.tabToTitle[tabKey];
    
    if (!title || !res.titleTimers || !res.titleTimers[title]) {
      timeEl.textContent = '0s';
      return;
    }

    // Calculate elapsed time for this title
    const timer = res.titleTimers[title];
    let elapsedMs = 0;
    if (typeof timer.accumulated === 'number') elapsedMs += timer.accumulated;
    if (typeof timer.runningSince === 'number') elapsedMs += (Date.now() - timer.runningSince);
    const seconds = Math.floor(elapsedMs / 1000);
    timeEl.textContent = formatSeconds(seconds);
  });
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0s';
  if (sec < 60) return `${sec}s`;
  
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// Initialize the last question button
function initializeLastQuestionButton(): void {
  const lastQuestionBtn = document.getElementById('lastQuestionBtn');
  if (!lastQuestionBtn) return;

  lastQuestionBtn.addEventListener('click', async () => {
    try {
      const lastProblem = await getLastUsedProblem();
      if (lastProblem && lastProblem.link) {
        // Open the last used question in a new tab
        chrome.tabs.create({ url: lastProblem.link });
      } else {
        alert('No previous question found. Visit a LeetCode problem first!');
      }
    } catch (error) {
      console.error('Failed to open last question:', error);
      alert('Failed to open last question. Please try again.');
    }
  });

  // Update button state based on available data
  updateLastQuestionButton();
}

// Get the last used problem from storage
async function getLastUsedProblem(): Promise<any> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      const storage = result.leetcodeProblems;
      if (storage && storage.lastUsedProblemId && storage.problems) {
        const problem = storage.problems[storage.lastUsedProblemId];
        resolve(problem || null);
      } else {
        resolve(null);
      }
    });
  });
}

// Update the last question button state
async function updateLastQuestionButton(): Promise<void> {
  const lastQuestionBtn = document.getElementById('lastQuestionBtn');
  if (!lastQuestionBtn) return;

  try {
    const lastProblem = await getLastUsedProblem();
    if (lastProblem) {
      lastQuestionBtn.textContent = `📚 Open: ${lastProblem.title}`;
      lastQuestionBtn.style.background = '#28a745'; // Green when available
    } else {
      lastQuestionBtn.textContent = '📚 No Previous Question';
      lastQuestionBtn.style.background = '#6c757d'; // Gray when not available
    }
  } catch (error) {
    console.error('Failed to update last question button:', error);
    lastQuestionBtn.textContent = '📚 Error Loading';
    lastQuestionBtn.style.background = '#dc3545'; // Red for error
  }
}

// Initialize the stats button
function initializeStatsButton(): void {
  const statsBtn = document.getElementById('statsBtn');
  const statsSection = document.getElementById('statsSection');
  
  if (!statsBtn || !statsSection) return;

  statsBtn.addEventListener('click', async () => {
    if (statsSection.style.display === 'none') {
      await loadAndDisplayStats();
      statsSection.style.display = 'block';
      statsBtn.textContent = '📊 Hide Stats';
    } else {
      statsSection.style.display = 'none';
      statsBtn.textContent = '📊 Stats';
    }
  });
}

// Load and display statistics
async function loadAndDisplayStats(): Promise<void> {
  try {
    const stats = await getProblemStats();
    const tagStats = await getTagStats();
    const recommendations = await getAllRecommendations();
    
    // Update stats display
    const totalProblemsEl = document.getElementById('totalProblems');
    const totalTimeEl = document.getElementById('totalTime');
    const completedProblemsEl = document.getElementById('completedProblems');
    const recommendationsCountEl = document.getElementById('recommendationsCount');
    const tagStatsEl = document.getElementById('tagStats');
    
    if (totalProblemsEl) totalProblemsEl.textContent = stats.totalProblems.toString();
    if (totalTimeEl) totalTimeEl.textContent = formatSeconds(Math.floor(stats.totalTimeSpent / 1000));
    if (completedProblemsEl) completedProblemsEl.textContent = stats.completedProblems.toString();
    if (recommendationsCountEl) recommendationsCountEl.textContent = recommendations.length.toString();
    
    // Display tag statistics
    if (tagStatsEl) {
      tagStatsEl.innerHTML = '';
      const sortedTags = Object.entries(tagStats).sort((a, b) => b[1].count - a[1].count);
      
      sortedTags.slice(0, 10).forEach(([tag, stats]) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag';
        tagEl.textContent = `${tag} (${stats.count})`;
        tagEl.title = `Completed: ${stats.completed}/${stats.count} | Time: ${formatSeconds(Math.floor(stats.totalTime / 1000))}`;
        tagEl.addEventListener('click', () => getRandomRecommendationByTag(tag));
        tagStatsEl.appendChild(tagEl);
      });
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// Get problem statistics from storage
async function getProblemStats(): Promise<{
  totalProblems: number;
  totalTimeSpent: number;
  averageTimePerProblem: number;
  mostUsedProblem: any;
  completedProblems: number;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      const storage = result.leetcodeProblems;
      if (!storage || !storage.problems) {
        resolve({
          totalProblems: 0,
          totalTimeSpent: 0,
          averageTimePerProblem: 0,
          mostUsedProblem: null,
          completedProblems: 0
        });
        return;
      }

      const problems = Object.values(storage.problems);
      const totalProblems = problems.length;
      const completedProblems = problems.filter((p: any) => p.isCompleted).length;
      const totalTimeSpent = problems.reduce((sum: number, problem: any) => sum + (problem.timeSpent || 0), 0);
      const averageTimePerProblem = totalProblems > 0 ? totalTimeSpent / totalProblems : 0;
      
      const mostUsedProblem = problems.reduce((most: any, current: any) => 
        (current.timeSpent || 0) > (most.timeSpent || 0) ? current : most, 
        problems[0] || null
      );

      resolve({
        totalProblems,
        totalTimeSpent,
        averageTimePerProblem,
        mostUsedProblem,
        completedProblems
      });
    });
  });
}

// Get tag statistics
async function getTagStats(): Promise<{ [tag: string]: { count: number; completed: number; totalTime: number; lastAccessed: number } }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      const storage = result.leetcodeProblems;
      resolve(storage?.tagStats || {});
    });
  });
}

// Get all recommendations
async function getAllRecommendations(): Promise<any[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      const storage = result.leetcodeProblems;
      if (!storage || !storage.recommendations) {
        resolve([]);
        return;
      }

      const allRecommendations: any[] = [];
      Object.values(storage.recommendations).forEach((recs: any) => {
        allRecommendations.push(...recs);
      });
      resolve(allRecommendations);
    });
  });
}

// Get random recommendation by tag
async function getRandomRecommendationByTag(tag: string): Promise<void> {
  try {
    const allRecommendations = await getAllRecommendations();
    const tagRecommendations = allRecommendations.filter(rec => 
      rec.tags.some((t: string) => t.toLowerCase().includes(tag.toLowerCase()))
    );
    
    if (tagRecommendations.length > 0) {
      const randomIndex = Math.floor(Math.random() * tagRecommendations.length);
      const recommendation = tagRecommendations[randomIndex];
      chrome.tabs.create({ url: recommendation.link });
    } else {
      showNotification(`No recommendations found for tag: ${tag}`, 'warning');
    }
  } catch (error) {
    console.error('Failed to get recommendation by tag:', error);
    showNotification('Failed to get recommendation. Please try again.', 'error');
  }
}

// Initialize all buttons
function initializeAllButtons(): void {
  initializeLastQuestionButton();
  initializeStatsButton();
  initializeRandomRecommendationButton();
  initializeRandomRevisionButton();
  initializeTagClickHandlers();
}

// Initialize random recommendation button
function initializeRandomRecommendationButton(): void {
  const btn = document.getElementById('randomRecommendationBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      const recommendation = await getRandomRecommendation();
      if (recommendation && recommendation.link) {
        chrome.tabs.create({ url: recommendation.link });
      } else {
        showNotification('No recommendations available. Complete some problems first!', 'warning');
      }
    } catch (error) {
      console.error('Failed to get random recommendation:', error);
      showNotification('Failed to get recommendation. Please try again.', 'error');
    }
  });
}

// Initialize random revision button
function initializeRandomRevisionButton(): void {
  const btn = document.getElementById('randomRevisionBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      const revision = await getRandomRevisionProblem();
      if (revision && revision.link) {
        chrome.tabs.create({ url: revision.link });
      } else {
        showNotification('No revision problems available. Complete some problems first!', 'warning');
      }
    } catch (error) {
      console.error('Failed to get random revision:', error);
      showNotification('Failed to get revision problem. Please try again.', 'error');
    }
  });
}

// Initialize tag click handlers
function initializeTagClickHandlers(): void {
  // This will be called when tags are rendered
}

// Get random recommendation
async function getRandomRecommendation(): Promise<any> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      const storage = result.leetcodeProblems;
      if (!storage || !storage.recommendations) {
        resolve(null);
        return;
      }

      const allRecommendations: any[] = [];
      Object.values(storage.recommendations).forEach((recs: any) => {
        allRecommendations.push(...recs);
      });

      if (allRecommendations.length === 0) {
        resolve(null);
        return;
      }

      const randomIndex = Math.floor(Math.random() * allRecommendations.length);
      resolve(allRecommendations[randomIndex]);
    });
  });
}

// Get random revision problem
async function getRandomRevisionProblem(): Promise<any> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblems'], (result) => {
      const storage = result.leetcodeProblems;
      if (!storage || !storage.revisions) {
        resolve(null);
        return;
      }

      const revisions = Object.values(storage.revisions);
      if (revisions.length === 0) {
        resolve(null);
        return;
      }

      const randomIndex = Math.floor(Math.random() * revisions.length);
      resolve(revisions[randomIndex]);
    });
  });
}

// Show notification
function showNotification(message: string, type: 'success' | 'warning' | 'error' = 'success'): void {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#48bb78' : type === 'warning' ? '#ed8936' : '#e53e3e'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

function cleanup(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
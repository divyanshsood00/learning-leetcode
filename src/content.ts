// content.ts

// Global state
let titleObserver: MutationObserver | null = null;
let submissionObserver: MutationObserver | null = null;
let currentProblemId: string | null = null;

// Initialize
initializeListeners();
reportTitleToBackground();
setupTitleObserver();
setupSubmissionDetection();

function initializeListeners(): void {
  chrome.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
    if (request && request.action === 'getProblemData') {
      try {
        const data = extractProblemData();
        sendResponse({ success: true, data });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ success: false, error });
      }
    }
    return true; // Keep message channel open for async response
  });
}

/**
 * Best-effort extraction of LeetCode problem data.
 * Returns: { title, difficulty, problemType, tags, description, isVisible }
 */
function extractProblemData(): any {
  // Problem title (usually the h1)
  const title = (document.querySelector('.text-title-large')?.textContent || '').trim() || 'Unknown Title';
  const number = title.includes(".") ? parseInt(title.split(".")[0]) : -1;

  // Difficulty: try well-known selectors, then fallback to scanning text for Easy/Medium/Hard
  let difficulty = extractDifficulty();
  
  // Tags: try several selectors and a fallback that looks for anchors with "/tag/" or "topic"
  const tags = extractTags();

  // Problem type: try to guess from breadcrumbs/anchors or meta description
  const problemType = extractProblemType();

  const description = "A beautiful question";

  // Get the current page URL
  const link = window.location.href;

  // Is the page/tab visible to the user right now?
  const isVisible = document.visibilityState === 'visible';

  const problemData = {
    title,
    number,
    difficulty,
    problemType,
    tags,
    description,
    link,
    isVisible,
    isCompleted: false,
    attempts: 0
  };

  // Generate problem ID for tracking
  currentProblemId = generateProblemId(problemData);

  // Save problem data to storage
  saveProblemData(problemData);

  return problemData;
}

function extractDifficulty(): string {
  const difficultySelectors = [
    '.text-difficulty',
    '.css-1o9l1vi'
  ];

  for (const selector of difficultySelectors) {
    const element = document.querySelector(selector);
    if (element?.textContent?.trim()) {
      return element.textContent.trim();
    }
  }

  // Fallback: scan text for Easy/Medium/Hard
  const text = document.body.textContent || '';
  const match = text.match(/\b(Easy|Medium|Hard)\b/);
  return match ? match[0] : 'Unknown';
}

function extractTags(): string[] {
  const tagSelectors = [
    '.topic-tag',      // common naming
    '.tags a',
    '.question__tags a',
    'a[href*="/tag/"]',
    'a[href*="/topics/"]',
    'a[href*="/topic/"]'
  ];

  const tagSet = new Set<string>();
  
  tagSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      const text = element.textContent?.trim();
      if (text) tagSet.add(text);
    });
  });

  // Also try to find a nearby "Topics" or "Related Topics" header and grab anchors under it
  const headerCandidates = Array.from(document.querySelectorAll('h2,h3,h4,div')).filter(el =>
    /topics|tags|related topics|related/i.test((el.textContent || ''))
  );

  headerCandidates.forEach(header => {
    const next = header.nextElementSibling;
    if (next) {
      next.querySelectorAll('a').forEach(anchor => {
        const text = anchor.textContent?.trim();
        if (text) tagSet.add(text);
      });
    }
  });

  return Array.from(tagSet).filter(Boolean);
}

function extractProblemType(): string {
  const problemTypes = ['Algorithms', 'Database', 'Shell', 'Concurrency', 'System Design', 'Math', 'Design'];
  const anchors = Array.from(document.querySelectorAll('a'));

  for (const anchor of anchors) {
    const text = anchor.textContent?.trim() || '';
    const foundType = problemTypes.find(type => 
      new RegExp(type, 'i').test(text)
    );
    if (foundType) return foundType;
  }

  // Fallback: check meta description
  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const match = metaDesc.match(/\b(Algorithms|Database|Shell|Concurrency|System Design|Math|Design)\b/i);
  return match ? match[0] : 'Unknown';
}

function reportTitleToBackground(): void {
  const title = document.title || null;
  chrome.runtime.sendMessage({ action: 'reportTitle', title }, (response: any) => {
    // Optional callback - could handle response if needed
  });
}

function setupTitleObserver(): void {
  // If your site is SPA and title can change, watch for title changes
  titleObserver = new MutationObserver(() => reportTitleToBackground());
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, { childList: true });
  }
}

// Save problem data to storage
async function saveProblemData(problemData: any): Promise<void> {
  try {
    // Check if ProblemStorageManager is available
    if (typeof (window as any).ProblemStorageManager !== 'undefined') {
      await (window as any).ProblemStorageManager.saveProblem(problemData);
      console.log('Problem data saved:', problemData.title);
    } else {
      // Fallback: save to chrome storage directly
      const storageKey = `problem_${problemData.number}_${problemData.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
      chrome.storage.local.set({ [storageKey]: problemData });
    }
  } catch (error) {
    console.error('Failed to save problem data:', error);
  }
}

// Generate problem ID
function generateProblemId(problemData: any): string {
  return `${problemData.number}-${problemData.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

// Setup submission detection
function setupSubmissionDetection(): void {
  // Look for submission result indicators
  const submissionSelectors = [
    '[data-e2e-locator="console-result"]',
    '.success-message',
    '.accepted',
    '[data-testid="testcase-result"]',
    '.text-green-600',
    '.text-green-500'
  ];

  // Check for success indicators periodically
  const checkSubmission = () => {
    for (const selector of submissionSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent?.toLowerCase() || '';
        if (text.includes('accepted') || text.includes('success') || text.includes('passed')) {
          handleSuccessfulSubmission();
        }
      });
    }
  };

  // Check every 2 seconds
  setInterval(checkSubmission, 2000);

  // Also observe DOM changes for dynamic content
  submissionObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        checkSubmission();
      }
    });
  });

  submissionObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Handle successful submission
async function handleSuccessfulSubmission(): Promise<void> {
  if (!currentProblemId) return;

  try {
    // Mark problem as completed
    if (typeof (window as any).ProblemStorageManager !== 'undefined') {
      await (window as any).ProblemStorageManager.markProblemCompleted(currentProblemId);
      
      // Fetch and store similar questions
      await fetchAndStoreSimilarQuestions();
      
      console.log('Problem marked as completed and similar questions fetched');
    }
  } catch (error) {
    console.error('Failed to handle submission:', error);
  }
}

// Fetch similar questions (mock implementation - in real app, you'd call LeetCode API)
async function fetchAndStoreSimilarQuestions(): Promise<void> {
  if (!currentProblemId) return;

  try {
    // Mock similar questions - in a real implementation, you'd call LeetCode's API
    const mockSimilarQuestions = [
      {
        title: "Two Sum II - Input array is sorted",
        number: 167,
        difficulty: "Easy",
        tags: ["Array", "Two Pointers", "Binary Search"],
        link: "https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/",
        acceptanceRate: 58.2
      },
      {
        title: "3Sum",
        number: 15,
        difficulty: "Medium",
        tags: ["Array", "Two Pointers", "Sorting"],
        link: "https://leetcode.com/problems/3sum/",
        acceptanceRate: 32.1
      },
      {
        title: "4Sum",
        number: 18,
        difficulty: "Medium",
        tags: ["Array", "Two Pointers", "Sorting"],
        link: "https://leetcode.com/problems/4sum/",
        acceptanceRate: 35.2
      }
    ];

    if (typeof (window as any).ProblemStorageManager !== 'undefined') {
      await (window as any).ProblemStorageManager.addRecommendations(currentProblemId, mockSimilarQuestions);
    }
  } catch (error) {
    console.error('Failed to fetch similar questions:', error);
  }
}

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
  if (titleObserver) {
    titleObserver.disconnect();
    titleObserver = null;
  }
  if (submissionObserver) {
    submissionObserver.disconnect();
    submissionObserver = null;
  }
});
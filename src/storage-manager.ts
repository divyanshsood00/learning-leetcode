// storage-manager.ts

// Interface for problem data stored in localStorage
interface StoredProblemData {
  title: string;
  number: number;
  difficulty: string;
  problemType: string;
  tags: string[];
  description: string;
  link: string;
  lastAccessed: number; // timestamp
  timeSpent: number; // total time spent in milliseconds
  isCompleted: boolean; // whether the problem was solved correctly
  completedAt?: number; // timestamp when completed
  attempts: number; // number of attempts
}

// Interface for similar question recommendations
interface SimilarQuestion {
  title: string;
  number: number;
  difficulty: string;
  tags: string[];
  link: string;
  acceptanceRate?: number;
}

// Interface for tag statistics
interface TagStats {
  [tag: string]: {
    count: number;
    completed: number;
    totalTime: number;
    lastAccessed: number;
  };
}

// Interface for the storage structure
interface ProblemStorage {
  problems: { [problemId: string]: StoredProblemData };
  lastUsedProblemId: string | null;
  recommendations: { [problemId: string]: SimilarQuestion[] };
  revisions: { [problemId: string]: StoredProblemData };
  tagStats: TagStats;
  settings: {
    maxStoredProblems: number;
    autoSave: boolean;
    maxRecommendations: number;
  };
}

class ProblemStorageManager {
  private static readonly STORAGE_KEY = 'leetcodeProblems';
  private static readonly DEFAULT_SETTINGS = {
    maxStoredProblems: 50,
    autoSave: true,
    maxRecommendations: 20
  };

  // Get all stored problems
  static async getAllProblems(): Promise<{ [problemId: string]: StoredProblemData }> {
    const storage = await this.getStorage();
    return storage.problems || {};
  }

  // Get a specific problem by ID
  static async getProblem(problemId: string): Promise<StoredProblemData | null> {
    const problems = await this.getAllProblems();
    return problems[problemId] || null;
  }

  // Get the last used problem
  static async getLastUsedProblem(): Promise<StoredProblemData | null> {
    const storage = await this.getStorage();
    if (!storage.lastUsedProblemId) return null;
    return await this.getProblem(storage.lastUsedProblemId);
  }

  // Save or update a problem
  static async saveProblem(problemData: Omit<StoredProblemData, 'lastAccessed' | 'timeSpent'>): Promise<void> {
    const problemId = this.generateProblemId(problemData);
    const storage = await this.getStorage();
    
    // Get existing problem data or create new
    const existingProblem = storage.problems[problemId] || {
      timeSpent: 0,
      lastAccessed: 0
    };

    // Update problem data
    const updatedProblem: StoredProblemData = {
      ...problemData,
      lastAccessed: Date.now(),
      timeSpent: existingProblem.timeSpent
    };

    storage.problems[problemId] = updatedProblem;
    storage.lastUsedProblemId = problemId;

    // Clean up old problems if we exceed the limit
    await this.cleanupOldProblems(storage);

    // Save to localStorage
    await this.saveStorage(storage);
  }

  // Update time spent for a problem
  static async updateTimeSpent(problemId: string, additionalTime: number): Promise<void> {
    const storage = await this.getStorage();
    if (storage.problems[problemId]) {
      storage.problems[problemId].timeSpent += additionalTime;
      storage.problems[problemId].lastAccessed = Date.now();
      await this.saveStorage(storage);
    }
  }

  // Get problem statistics
  static async getProblemStats(): Promise<{
    totalProblems: number;
    totalTimeSpent: number;
    averageTimePerProblem: number;
    mostUsedProblem: StoredProblemData | null;
  }> {
    const problems = await this.getAllProblems();
    const problemList = Object.values(problems);
    
    const totalProblems = problemList.length;
    const totalTimeSpent = problemList.reduce((sum, problem) => sum + problem.timeSpent, 0);
    const averageTimePerProblem = totalProblems > 0 ? totalTimeSpent / totalProblems : 0;
    
    const mostUsedProblem = problemList.reduce((most, current) => 
      current.timeSpent > most.timeSpent ? current : most, 
      problemList[0] || null
    );

    return {
      totalProblems,
      totalTimeSpent,
      averageTimePerProblem,
      mostUsedProblem
    };
  }

  // Clear all stored problems
  static async clearAllProblems(): Promise<void> {
    const storage = await this.getStorage();
    storage.problems = {};
    storage.lastUsedProblemId = null;
    await this.saveStorage(storage);
  }

  // Delete a specific problem
  static async deleteProblem(problemId: string): Promise<void> {
    const storage = await this.getStorage();
    delete storage.problems[problemId];
    
    // If this was the last used problem, clear the reference
    if (storage.lastUsedProblemId === problemId) {
      storage.lastUsedProblemId = null;
    }
    
    await this.saveStorage(storage);
  }

  // Generate a unique problem ID based on problem data
  private static generateProblemId(problemData: Omit<StoredProblemData, 'lastAccessed' | 'timeSpent'>): string {
    // Use a combination of title and number for uniqueness
    const baseId = `${problemData.number}-${problemData.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return baseId;
  }

  // Get the current storage data
  private static async getStorage(): Promise<ProblemStorage> {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], (result) => {
        const storage = result[this.STORAGE_KEY] as ProblemStorage;
        if (!storage) {
        resolve({
          problems: {},
          lastUsedProblemId: null,
          recommendations: {},
          revisions: {},
          tagStats: {},
          settings: this.DEFAULT_SETTINGS
        });
        } else {
          resolve(storage);
        }
      });
    });
  }

  // Save storage data
  private static async saveStorage(storage: ProblemStorage): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: storage }, () => {
        resolve();
      });
    });
  }

  // Clean up old problems when we exceed the limit
  private static async cleanupOldProblems(storage: ProblemStorage): Promise<void> {
    const problems = Object.entries(storage.problems);
    const maxProblems = storage.settings.maxStoredProblems;

    if (problems.length <= maxProblems) return;

    // Sort by lastAccessed (oldest first) and remove excess
    problems.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const toRemove = problems.slice(0, problems.length - maxProblems);

    toRemove.forEach(([problemId]) => {
      delete storage.problems[problemId];
    });
  }

  // Export problems data (for backup)
  static async exportData(): Promise<string> {
    const storage = await this.getStorage();
    return JSON.stringify(storage, null, 2);
  }

  // Import problems data (for restore)
  static async importData(jsonData: string): Promise<boolean> {
    try {
      const importedData = JSON.parse(jsonData) as ProblemStorage;
      
      // Validate the imported data structure
      if (!importedData.problems || typeof importedData.problems !== 'object') {
        throw new Error('Invalid data format');
      }

      await this.saveStorage(importedData);
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }

  // Mark a problem as completed
  static async markProblemCompleted(problemId: string): Promise<void> {
    const storage = await this.getStorage();
    if (storage.problems[problemId]) {
      storage.problems[problemId].isCompleted = true;
      storage.problems[problemId].completedAt = Date.now();
      storage.problems[problemId].attempts = (storage.problems[problemId].attempts || 0) + 1;
      
      // Add to revisions
      storage.revisions[problemId] = { ...storage.problems[problemId] };
      
      // Update tag statistics
      await this.updateTagStats(storage, storage.problems[problemId], true);
      
      await this.saveStorage(storage);
    }
  }

  // Add recommendations for a problem
  static async addRecommendations(problemId: string, recommendations: SimilarQuestion[]): Promise<void> {
    const storage = await this.getStorage();
    storage.recommendations[problemId] = recommendations.slice(0, storage.settings.maxRecommendations);
    await this.saveStorage(storage);
  }

  // Get recommendations for a problem
  static async getRecommendations(problemId: string): Promise<SimilarQuestion[]> {
    const storage = await this.getStorage();
    return storage.recommendations[problemId] || [];
  }

  // Get all recommendations
  static async getAllRecommendations(): Promise<SimilarQuestion[]> {
    const storage = await this.getStorage();
    const allRecommendations: SimilarQuestion[] = [];
    Object.values(storage.recommendations).forEach(recs => {
      allRecommendations.push(...recs);
    });
    return allRecommendations;
  }

  // Get random recommendation
  static async getRandomRecommendation(): Promise<SimilarQuestion | null> {
    const allRecommendations = await this.getAllRecommendations();
    if (allRecommendations.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * allRecommendations.length);
    return allRecommendations[randomIndex];
  }

  // Get random recommendation by tag
  static async getRandomRecommendationByTag(tag: string): Promise<SimilarQuestion | null> {
    const allRecommendations = await this.getAllRecommendations();
    const tagRecommendations = allRecommendations.filter(rec => 
      rec.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
    );
    
    if (tagRecommendations.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * tagRecommendations.length);
    return tagRecommendations[randomIndex];
  }

  // Get tag statistics
  static async getTagStats(): Promise<TagStats> {
    const storage = await this.getStorage();
    return storage.tagStats || {};
  }

  // Update tag statistics
  private static async updateTagStats(storage: ProblemStorage, problem: StoredProblemData, isCompleted: boolean): Promise<void> {
    if (!storage.tagStats) storage.tagStats = {};
    
    problem.tags.forEach(tag => {
      if (!storage.tagStats[tag]) {
        storage.tagStats[tag] = {
          count: 0,
          completed: 0,
          totalTime: 0,
          lastAccessed: 0
        };
      }
      
      storage.tagStats[tag].count++;
      storage.tagStats[tag].totalTime += problem.timeSpent;
      storage.tagStats[tag].lastAccessed = problem.lastAccessed;
      
      if (isCompleted) {
        storage.tagStats[tag].completed++;
      }
    });
  }

  // Get problems by tag
  static async getProblemsByTag(tag: string): Promise<StoredProblemData[]> {
    const problems = await this.getAllProblems();
    return Object.values(problems).filter(problem => 
      problem.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
    );
  }

  // Get revision problems (completed problems)
  static async getRevisionProblems(): Promise<StoredProblemData[]> {
    const storage = await this.getStorage();
    return Object.values(storage.revisions || {});
  }

  // Get random revision problem
  static async getRandomRevisionProblem(): Promise<StoredProblemData | null> {
    const revisions = await this.getRevisionProblems();
    if (revisions.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * revisions.length);
    return revisions[randomIndex];
  }
}

// Make it available globally for use in other scripts
(window as any).ProblemStorageManager = ProblemStorageManager;

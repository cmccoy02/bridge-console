import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_BASE = 'https://api.github.com';

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
  }
});

// Create a client with a user's access token
function createUserClient(accessToken) {
  return axios.create({
    baseURL: API_BASE,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });
}

// Fetch user's repositories
export async function getUserRepos(accessToken, page = 1, perPage = 30, type = 'all') {
  try {
    const userClient = createUserClient(accessToken);
    const { data, headers } = await userClient.get('/user/repos', {
      params: {
        page,
        per_page: perPage,
        type, // all, owner, public, private, member
        sort: 'updated',
        direction: 'desc'
      }
    });

    // Check if there are more pages
    const linkHeader = headers.link || '';
    const hasMore = linkHeader.includes('rel="next"');

    return {
      repos: data.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        ownerAvatar: repo.owner.avatar_url,
        description: repo.description,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch
      })),
      hasMore,
      page
    };
  } catch (error) {
    console.error('[GitHub] Error fetching user repos:', error.response?.data || error.message);
    throw error;
  }
}

// Fetch user's organizations
export async function getUserOrgs(accessToken) {
  try {
    const userClient = createUserClient(accessToken);
    const { data } = await userClient.get('/user/orgs');

    return data.map(org => ({
      id: org.id,
      login: org.login,
      avatarUrl: org.avatar_url,
      description: org.description
    }));
  } catch (error) {
    console.error('[GitHub] Error fetching user orgs:', error.response?.data || error.message);
    throw error;
  }
}

// Fetch organization's repositories
export async function getOrgRepos(accessToken, orgName, page = 1, perPage = 30) {
  try {
    const userClient = createUserClient(accessToken);
    const { data, headers } = await userClient.get(`/orgs/${orgName}/repos`, {
      params: {
        page,
        per_page: perPage,
        sort: 'updated',
        direction: 'desc'
      }
    });

    const linkHeader = headers.link || '';
    const hasMore = linkHeader.includes('rel="next"');

    return {
      repos: data.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        ownerAvatar: repo.owner.avatar_url,
        description: repo.description,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch
      })),
      hasMore,
      page
    };
  } catch (error) {
    console.error('[GitHub] Error fetching org repos:', error.response?.data || error.message);
    throw error;
  }
}

export async function getRepoMetadata(owner, repo) {
  try {
    // 1. Basic Info (Age, Size)
    const { data: repoData } = await client.get(`/repos/${owner}/${repo}`);
    
    // Calculate Age
    const createdDate = new Date(repoData.created_at);
    const now = new Date();
    const ageInDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));

    // 2. Languages
    const { data: langData } = await client.get(`/repos/${owner}/${repo}/languages`);
    
    // 3. Branches & Dead Branches
    // Note: GitHub API pagination limits to 30 by default, simplistic fetch for MVP
    const { data: branches } = await client.get(`/repos/${owner}/${repo}/branches?per_page=100`);
    
    let deadBranches = 0;
    const branchChecks = branches.map(async (branch) => {
      try {
        const { data: commitData } = await client.get(`/repos/${owner}/${repo}/commits/${branch.commit.sha}`);
        const lastCommitDate = new Date(commitData.commit.author.date);
        const diffDays = Math.floor((now - lastCommitDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 90) return 1; // Dead if > 90 days
        return 0;
      } catch (e) {
        return 0;
      }
    });

    const results = await Promise.all(branchChecks);
    deadBranches = results.reduce((a, b) => a + b, 0);

    return {
      repoAgeDays: ageInDays,
      languageBreakdown: langData,
      branchCount: branches.length,
      deadBranchCount: deadBranches
    };

  } catch (error) {
    console.error('GitHub API Error:', error.response?.data || error.message);
    // Return safe defaults if API fails (e.g., rate limit or bad token)
    return {
      repoAgeDays: 0,
      languageBreakdown: {},
      branchCount: 0,
      deadBranchCount: 0
    };
  }
}
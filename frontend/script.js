// Use relative API path for same-origin deployment
const API_BASE = '';
let currentUser = null;
let currentPage = 1;
let currentResults = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    checkSavedUser();
    loadStats();
    
    // Add event listeners for auth forms
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
});

// Check if user is already logged in
function checkSavedUser() {
    const savedApiKey = localStorage.getItem('l2b_api_key');
    if (savedApiKey) {
        verifyApiKey(savedApiKey);
    }
}

// Verify API key and load user profile
async function verifyApiKey(apiKey) {
    try {
        showNotification('Verifying API key...', 'info');
        const response = await fetch(`${API_BASE}/api/users/profile`, {
            headers: {
                'X-API-Key': apiKey
            }
        });

        if (response.ok) {
            const userData = await response.json();
            loginUser(userData, apiKey);
            showNotification('Welcome back!', 'success');
        } else {
            localStorage.removeItem('l2b_api_key');
            showNotification('Invalid API key. Please log in again.', 'error');
        }
    } catch (error) {
        console.error('API key verification failed:', error);
        localStorage.removeItem('l2b_api_key');
        showNotification('Connection failed. Please check your internet.', 'error');
    }
}

// Login user
function loginUser(userData, apiKey) {
    currentUser = { ...userData, apiKey };
    localStorage.setItem('l2b_api_key', apiKey);
    
    updateUIForLoggedInUser();
    loadUserProfile();
}

// Logout user
function logout() {
    currentUser = null;
    localStorage.removeItem('l2b_api_key');
    updateUIForLoggedOutUser();
    closeModal('authModal');
    showNotification('Logged out successfully', 'info');
}

// Update UI for logged in user
function updateUIForLoggedInUser() {
    document.getElementById('userMenu').style.display = 'block';
    document.getElementById('authMenu').style.display = 'none';
    document.getElementById('userStatusBar').style.display = 'block';
    
    if (currentUser) {
        document.getElementById('userEmail').textContent = currentUser.email;
        document.getElementById('dropdownEmail').textContent = currentUser.email;
        document.getElementById('dropdownPlan').textContent = currentUser.plan;
        document.getElementById('dropdownCredits').textContent = `${currentUser.credits_remaining} remaining`;
        
        document.getElementById('welcomeEmail').textContent = currentUser.email;
        document.getElementById('welcomePlan').textContent = currentUser.plan;
        document.getElementById('welcomePlan').className = `plan-badge ${currentUser.plan}`;
    }
}

// Update UI for logged out user
function updateUIForLoggedOutUser() {
    document.getElementById('userMenu').style.display = 'none';
    document.getElementById('authMenu').style.display = 'block';
    document.getElementById('userStatusBar').style.display = 'none';
    document.getElementById('results').style.display = 'none';
}

// Load user profile
async function loadUserProfile() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE}/api/users/profile`, {
            headers: {
                'X-API-Key': currentUser.apiKey
            }
        });

        if (response.ok) {
            const userData = await response.json();
            currentUser = { ...userData, apiKey: currentUser.apiKey };
            
            // Update UI with fresh data
            document.getElementById('remainingCredits').textContent = userData.credits_remaining;
            document.getElementById('totalCredits').textContent = userData.max_credits;
            document.getElementById('dropdownCredits').textContent = `${userData.credits_remaining} remaining`;
        }
    } catch (error) {
        console.error('Failed to load user profile:', error);
    }
}

// Show authentication modal
function showAuthModal() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    switchAuthTab('register');
}

// Switch between register and login tabs
function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-tab-content').forEach(content => content.style.display = 'none');
    
    event.target.classList.add('active');
    
    if (tab === 'register') {
        document.getElementById('registerTab').style.display = 'block';
        document.getElementById('loginTab').style.display = 'none';
    } else {
        document.getElementById('registerTab').style.display = 'none';
        document.getElementById('loginTab').style.display = 'block';
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const plan = document.getElementById('registerPlan').value;
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/api/users/register?email=${encodeURIComponent(email)}&plan=${plan}`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            showApiKeyModal(data);
            showNotification('Registration successful!', 'success');
        } else {
            const error = await response.json();
            showNotification(`Registration failed: ${error.detail}`, 'error');
        }
    } catch (error) {
        showNotification('Registration failed. Please try again.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Handle login with API key
async function handleLogin(e) {
    e.preventDefault();
    
    const apiKey = document.getElementById('apiKey').value.trim();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
    submitBtn.disabled = true;
    
    await verifyApiKey(apiKey);
    
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
}

// Show API key modal after registration
function showApiKeyModal(userData) {
    document.getElementById('apiKeyValue').textContent = userData.api_key;
    document.getElementById('apiKeyEmail').textContent = userData.email;
    document.getElementById('apiKeyPlan').textContent = userData.plan;
    document.getElementById('apiKeyCredits').textContent = `${userData.max_credits} credits`;
    
    closeModal('authModal');
    
    const modal = document.getElementById('apiKeyModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Copy API key to clipboard
function copyApiKey() {
    const apiKey = document.getElementById('apiKeyValue').textContent;
    navigator.clipboard.writeText(apiKey).then(() => {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    });
}

// Show upgrade modal
function showUpgradeModal() {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    const currentPlanInfo = document.getElementById('currentPlanInfo');
    currentPlanInfo.innerHTML = `
        <div class="current-plan-card">
            <h4>Current Plan: <span class="plan-${currentUser.plan}">${currentUser.plan.toUpperCase()}</span></h4>
            <p>Credits: ${currentUser.credits_remaining} / ${currentUser.max_credits} remaining</p>
        </div>
    `;

    const modal = document.getElementById('upgradeModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Upgrade plan
async function upgradePlan(newPlan) {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE}/api/users/upgrade?new_plan=${newPlan}`, {
            method: 'POST',
            headers: {
                'X-API-Key': currentUser.apiKey
            }
        });

        if (response.ok) {
            const data = await response.json();
            showNotification(`Successfully upgraded to ${newPlan} plan!`, 'success');
            closeModal('upgradeModal');
            loadUserProfile(); // Refresh user data
        } else {
            const error = await response.json();
            showNotification(`Upgrade failed: ${error.detail}`, 'error');
        }
    } catch (error) {
        showNotification('Upgrade failed. Please try again.', 'error');
    }
}

// Show user menu dropdown
function showUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.user-menu-trigger')) {
        document.getElementById('userDropdown').style.display = 'none';
    }
});

// Load platform statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalBusinesses').textContent = stats.total_businesses ? stats.total_businesses.toLocaleString() : '1.38M+';
            document.getElementById('totalUsers').textContent = stats.total_users ? stats.total_users.toLocaleString() + '+' : '1K+';
            document.getElementById('totalIndustries').textContent = stats.total_industries ? stats.total_industries.toLocaleString() : '500+';
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// ============================================================================
// SEARCH FUNCTIONALITY - UNCHANGED
// ============================================================================

// Search form handler
document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        showAuthModal();
        return;
    }

    const name = document.getElementById('name').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;
    const industry = document.getElementById('industry').value;
    
    const params = {
        name: name || undefined,
        city: city || undefined,
        state: state || undefined,
        industry: industry || undefined,
        page: 1,
        limit: 20
    };

    await searchBusinesses(params);
});

// Search businesses
async function searchBusinesses(params) {
    // No authentication required - free search for everyone
    showLoading();
    
    try {
        const queryParams = new URLSearchParams();
        if (params.name) queryParams.append('name', params.name);
        if (params.city) queryParams.append('city', params.city);
        if (params.state) queryParams.append('state', params.state);
        if (params.industry) queryParams.append('industry', params.industry);
        queryParams.append('page', params.page);
        queryParams.append('limit', params.limit);
        
        const response = await fetch(`${API_BASE}/api/businesses/search?${queryParams}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('Search results:', data.data.length, 'businesses found');

        currentResults = data.data;
        currentPage = data.pagination.page;
        displayResults(data);
        
        // Show credit usage
        document.getElementById('searchCredits').style.display = 'block';
        
        // Update user credits
        if (data.user_credits_remaining !== undefined) {
            document.getElementById('remainingCredits').textContent = data.user_credits_remaining;
            document.getElementById('dropdownCredits').textContent = `${data.user_credits_remaining} remaining`;
            currentUser.credits_remaining = data.user_credits_remaining;
        }
        
        showNotification(`Found ${data.pagination.total.toLocaleString()} businesses`, 'success');
        
    } catch (error) {
        console.error('Search error:', error);
        showError('Search failed: ' + error.message);
        showNotification('Search failed: ' + error.message, 'error');
    }
}

// Display results
function displayResults(data) {
    const resultsSection = document.getElementById('results');
    const resultsContainer = document.getElementById('businessResults');
    const resultsCount = document.getElementById('resultsCount');

    resultsSection.style.display = 'block';
    resultsCount.textContent = `Found ${data.pagination.total.toLocaleString()} businesses`;

    if (data.data.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #6b7280;">
                <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h3>No businesses found</h3>
                <p>Try adjusting your search criteria</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = data.data.map(business => `
        <div class="business-card">
            <div class="business-header">
                <div class="business-name">${escapeHtml(business.legal_business_name)}</div>
                <div class="premium-badge" title="Premium features available">⭐</div>
            </div>
            <div class="business-location">
                <i class="fas fa-map-marker-alt"></i> 
                ${escapeHtml(business.business_city)}, ${escapeHtml(business.business_state)}
            </div>
            <div class="business-industry">
                ${escapeHtml(business.industry_name || business.industry_sector || 'Unknown Industry')}
                ${business.primary_naics ? `<span class="naics-code">NAICS: ${business.primary_naics}</span>` : ''}
            </div>
            <div class="business-actions">
                <button class="btn btn-primary" onclick="viewBusinessDetails(${business.id})">
                    <i class="fas fa-eye"></i> Details
                </button>
                <button class="btn btn-premium" onclick="showContactModal(${business.id})">
                    <i class="fas fa-phone"></i> Contact
                </button>
                <button class="btn btn-premium" onclick="showAIInsights(${business.id}, 'business_insights')">
                    <i class="fas fa-robot"></i> AI Insights
                </button>
            </div>
        </div>
    `).join('');

    displayPagination(data.pagination);
}

// Show contact modal
async function showContactModal(businessId) {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    if (currentUser.plan === 'free') {
        showNotification('Premium plan required for contact information', 'error');
        showUpgradeModal();
        return;
    }

    const modal = document.getElementById('contactModal');
    const contactDetails = document.getElementById('contactDetails');
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    contactDetails.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Loading contact information...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/api/businesses/${businessId}/contact`, {
            headers: {
                'X-API-Key': currentUser.apiKey
            }
        });

        if (response.status === 402) {
            contactDetails.innerHTML = `
                <div class="premium-feature">
                    <i class="fas fa-crown"></i>
                    <h4>Insufficient Credits</h4>
                    <p>You don't have enough credits to view contact information.</p>
                    <button class="btn btn-premium" onclick="showUpgradeModal()">
                        Upgrade Your Plan
                    </button>
                </div>
            `;
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch contact information');
        }

        const data = await response.json();
        
        contactDetails.innerHTML = `
            <div class="contact-details">
                <h4>Contact Information</h4>
                <div class="contact-grid">
                    <div class="contact-item">
                        <i class="fas fa-phone"></i>
                        <div>
                            <strong>Phone</strong>
                            <p>${escapeHtml(data.premium_contact.phone)}</p>
                        </div>
                    </div>
                    <div class="contact-item">
                        <i class="fas fa-envelope"></i>
                        <div>
                            <strong>Email</strong>
                            <p>${escapeHtml(data.premium_contact.email)}</p>
                        </div>
                    </div>
                    <div class="contact-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <div>
                            <strong>Address</strong>
                            <p>${escapeHtml(data.premium_contact.address)}</p>
                        </div>
                    </div>
                    <div class="contact-item">
                        <i class="fas fa-user"></i>
                        <div>
                            <strong>Contact Person</strong>
                            <p>${escapeHtml(data.premium_contact.contact_person)}</p>
                            <small>${escapeHtml(data.premium_contact.title)}</small>
                        </div>
                    </div>
                    ${data.premium_contact.linkedin && data.premium_contact.linkedin !== 'LinkedIn not available' ? `
                    <div class="contact-item">
                        <i class="fab fa-linkedin"></i>
                        <div>
                            <strong>LinkedIn</strong>
                            <p><a href="${escapeHtml(data.premium_contact.linkedin)}" target="_blank">View Profile</a></p>
                        </div>
                    </div>
                    ` : ''}
                    ${data.premium_contact.website && data.premium_contact.website !== 'Website not available' ? `
                    <div class="contact-item">
                        <i class="fas fa-globe"></i>
                        <div>
                            <strong>Website</strong>
                            <p><a href="${escapeHtml(data.premium_contact.website)}" target="_blank">Visit Website</a></p>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div style="margin-top: 1rem; padding: 1rem; background: #f0f9ff; border-radius: 8px;">
                    <small>🔒 Premium contact information - 1 credit used</small>
                </div>
            </div>
        `;

        // Update user credits
        loadUserProfile();
        showNotification('Contact information loaded successfully', 'success');

    } catch (error) {
        console.error('Contact fetch error:', error);
        contactDetails.innerHTML = `
            <div style="color: #dc2626; text-align: center;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load contact information: ${error.message}</p>
                <button class="btn btn-secondary" onclick="showContactModal(${businessId})">Retry</button>
            </div>
        `;
        showNotification('Failed to load contact information', 'error');
    }
}

// Show AI insights
async function showAIInsights(businessId, analysisType) {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    const modal = document.getElementById('insightsModal');
    const content = document.getElementById('insightsContent');
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    content.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Generating AI insights...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/api/businesses/${businessId}/ai-insights`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': currentUser.apiKey
            },
            body: JSON.stringify({
                analysis_type: analysisType
            })
        });

        if (response.status === 402) {
            content.innerHTML = `
                <div class="premium-feature">
                    <i class="fas fa-crown"></i>
                    <h4>Insufficient Credits</h4>
                    <p>You don't have enough credits to generate AI insights.</p>
                    <button class="btn btn-premium" onclick="showUpgradeModal()">
                        Upgrade Your Plan
                    </button>
                </div>
            `;
            return;
        }

        const data = await response.json();

        if (response.ok && data.success) {
            content.innerHTML = `
                <div style="background: #f0f9ff; padding: 1rem; border-radius: 10px; margin-bottom: 1rem;">
                    <strong>Analysis Type:</strong> ${data.analysis_type.replace('_', ' ').toUpperCase()}
                </div>
                <div style="white-space: pre-wrap; line-height: 1.6; background: #f8fafc; padding: 1rem; border-radius: 8px;">
                    ${escapeHtml(data.ai_insights)}
                </div>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.9rem;">
                    Powered by DeepSeek AI • 1 credit used
                </div>
            `;
            
            // Update user credits
            loadUserProfile();
            showNotification('AI insights generated successfully', 'success');
        } else {
            content.innerHTML = `
                <div style="color: #dc2626; background: #fef2f2; padding: 1rem; border-radius: 10px;">
                    <strong>Error:</strong> ${data.ai_insights || 'Failed to generate insights'}
                </div>
            `;
            showNotification('Failed to generate AI insights', 'error');
        }
    } catch (error) {
        content.innerHTML = `
            <div style="color: #dc2626; background: #fef2f2; padding: 1rem; border-radius: 10px;">
                <strong>Error:</strong> ${error.message}
            </div>
        `;
        showNotification('Failed to generate AI insights', 'error');
    }
}

// ============================================================================
// NOTIFICATION SYSTEM - UNCHANGED
// ============================================================================

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-triangle',
        info: 'info-circle',
        warning: 'exclamation-circle'
    };
    return icons[type] || 'info-circle';
}

// ============================================================================
// EXISTING UTILITY FUNCTIONS - UNCHANGED
// ============================================================================

// View business details
async function viewBusinessDetails(businessId) {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/businesses/${businessId}`, {
            headers: {
                'X-API-Key': currentUser.apiKey
            }
        });
        
        if (response.ok) {
            const business = await response.json();
            alert(`Business Details:\n\nName: ${business.data.legal_business_name}\nLocation: ${business.data.business_city}, ${business.data.business_state}\nIndustry: ${business.data.industry_name}\nNAICS: ${business.data.primary_naics || 'N/A'}`);
        } else {
            throw new Error('Failed to load details');
        }
    } catch (error) {
        showError('Failed to load business details: ' + error.message);
    }
}

// Show pricing modal
function showPricing() {
    const modal = document.getElementById('pricingModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Show loading
function showLoading() {
    const resultsSection = document.getElementById('results');
    const resultsContainer = document.getElementById('businessResults');
    const resultsCount = document.getElementById('resultsCount');
    
    resultsSection.style.display = 'block';
    resultsCount.textContent = 'Searching...';
    resultsContainer.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Searching 1.38M+ businesses...</p>
        </div>
    `;
}

// Show error
function showError(message) {
    const resultsContainer = document.getElementById('businessResults');
    resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #dc2626;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

// Display pagination
function displayPagination(pagination) {
    const paginationContainer = document.getElementById('pagination');
    
    if (pagination.pages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '<div style="display: flex; justify-content: center; gap: 0.5rem; margin-top: 2rem;">';
    
    if (pagination.page > 1) {
        paginationHTML += `<button class="btn btn-secondary" onclick="loadPage(${pagination.page - 1})">Previous</button>`;
    }
    
    paginationHTML += `<span style="display: flex; align-items: center; padding: 0 1rem; color: #6b7280;">Page ${pagination.page} of ${pagination.pages}</span>`;
    
    if (pagination.page < pagination.pages) {
        paginationHTML += `<button class="btn btn-secondary" onclick="loadPage(${pagination.page + 1})">Next</button>`;
    }
    
    paginationHTML += '</div>';
    paginationContainer.innerHTML = paginationHTML;
}

// Load specific page
async function loadPage(page) {
    const name = document.getElementById('name').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;
    const industry = document.getElementById('industry').value;
    
    const params = {
        name: name || undefined,
        city: city || undefined,
        state: state || undefined,
        industry: industry || undefined,
        page: page,
        limit: 20
    };

    await searchBusinesses(params);
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = ['authModal', 'apiKeyModal', 'upgradeModal', 'contactModal', 'insightsModal', 'pricingModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            closeModal(modalId);
        }
    });
}

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modals = ['authModal', 'apiKeyModal', 'upgradeModal', 'contactModal', 'insightsModal', 'pricingModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal.style.display === 'block') {
                closeModal(modalId);
            }
        });
    }
});

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

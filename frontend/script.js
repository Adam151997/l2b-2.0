// L2B Business Intelligence Platform - Simplified Frontend
// No authentication required - free search for everyone

const API_BASE = '';  // Same origin

// State
let currentPage = 1;
let currentResults = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    loadStats();
});

// Load platform statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalBusinesses').textContent = formatNumber(stats.total_businesses);
            document.getElementById('totalIndustries').textContent = formatNumber(stats.total_industries);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Format numbers
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M+';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K+';
    return num.toString();
}

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

// Search form handler
document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Anyone can search - no login required!
    
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
        
        currentResults = data.data;
        currentPage = params.page;
        
        displayResults(data.data);
        displayPagination(data.pagination);

    } catch (error) {
        showError('Search failed: ' + error.message);
    }
}

// Display search results
function displayResults(businesses) {
    const resultsSection = document.getElementById('results');
    const businessResults = document.getElementById('businessResults');
    
    if (!businesses || businesses.length === 0) {
        businessResults.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>No businesses found. Try a different search term.</p>
            </div>
        `;
        resultsSection.style.display = 'block';
        document.getElementById('resultsCount').textContent = '0 results';
        return;
    }
    
    document.getElementById('resultsCount').textContent = `${businesses.length} businesses found`;
    
    businessResults.innerHTML = businesses.map(business => `
        <div class="business-card">
            <div class="business-header">
                <h3>${business.legal_business_name}</h3>
                <span class="industry-badge">${business.industry_name || business.industry_sector}</span>
            </div>
            <div class="business-details">
                <p><i class="fas fa-map-marker-alt"></i> ${business.business_city}, ${business.business_state}</p>
                <p><i class="fas fa-industry"></i> ${business.industry_sector}</p>
                <p><i class="fas fa-code"></i> NAICS: ${business.primary_naics}</p>
            </div>
            <div class="business-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewBusinessDetails(${business.id})">
                    <i class="fas fa-eye"></i> View Details
                </button>
                <button class="btn btn-primary btn-sm" onclick="showContactModal(${business.id})">
                    <i class="fas fa-phone"></i> Contact Info
                </button>
            </div>
        </div>
    `).join('');
    
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Display pagination
function displayPagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    
    if (!pagination || pagination.pages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    let html = '';
    
    if (pagination.page > 1) {
        html += `<button class="btn btn-secondary" onclick="goToPage(${pagination.page - 1})"><i class="fas fa-chevron-left"></i> Previous</button>`;
    }
    
    html += `<span class="page-info">Page ${pagination.page} of ${pagination.pages}</span>`;
    
    if (pagination.page < pagination.pages) {
        html += `<button class="btn btn-secondary" onclick="goToPage(${pagination.page + 1})">Next <i class="fas fa-chevron-right"></i></button>`;
    }
    
    paginationDiv.innerHTML = html;
}

// Go to page
async function goToPage(page) {
    const name = document.getElementById('name').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;
    const industry = document.getElementById('industry').value;
    
    await searchBusinesses({
        name: name || undefined,
        city: city || undefined,
        state: state || undefined,
        industry: industry || undefined,
        page: page,
        limit: 20
    });
}

// View business details
async function viewBusinessDetails(businessId) {
    try {
        const response = await fetch(`${API_BASE}/api/businesses/${businessId}`);
        
        if (!response.ok) {
            throw new Error('Failed to load business details');
        }
        
        const data = await response.json();
        
        // Show details in modal
        const modal = document.getElementById('detailsModal');
        const detailsContent = document.getElementById('detailsContent');
        
        detailsContent.innerHTML = `
            <h3>${data.data.legal_business_name}</h3>
            <div class="detail-row">
                <strong>Location:</strong> ${data.data.business_city}, ${data.data.business_state}, ${data.data.business_country}
            </div>
            <div class="detail-row">
                <strong>Industry:</strong> ${data.data.industry_name || data.data.industry_sector}
            </div>
            <div class="detail-row">
                <strong>NAICS Code:</strong> ${data.data.primary_naics}
            </div>
        `;
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        showError('Failed to load business details: ' + error.message);
    }
}

// Show contact modal
async function showContactModal(businessId) {
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
        const response = await fetch(`${API_BASE}/api/businesses/${businessId}/contact`);

        if (!response.ok) {
            throw new Error('Failed to fetch contact information');
        }

        const data = await response.json();
        
        contactDetails.innerHTML = `
            <div class="contact-info">
                <h4>${data.business_name}</h4>
                <p><i class="fas fa-map-marker-alt"></i> ${data.address}</p>
                <p><i class="fas fa-globe"></i> ${data.country}</p>
                <p><i class="fas fa-hashtag"></i> CAGE Code: ${data.cage_code}</p>
            </div>
        `;

    } catch (error) {
        contactDetails.innerHTML = `
            <div class="error">
                <p>Failed to load contact information.</p>
            </div>
        `;
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

// Close modals on outside click
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

// Show loading
function showLoading() {
    const resultsSection = document.getElementById('results');
    const businessResults = document.getElementById('businessResults');
    
    businessResults.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Searching businesses...</p>
        </div>
    `;
    
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Show error
function showError(message) {
    const resultsSection = document.getElementById('results');
    const businessResults = document.getElementById('businessResults');
    
    businessResults.innerHTML = `
        <div class="error">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
        </div>
    `;
    
    resultsSection.style.display = 'block';
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
// ==========================================================================
// PTL — Configuration & Global Namespace
// ==========================================================================
// This file MUST be loaded first.
// Sets up the Supabase client and the global PTL namespace that all other
// modules use to share state and helpers.
// ==========================================================================

window.PTL = window.PTL || {};

PTL.config = {
  SUPABASE_URL: 'https://qoreywvquagelclghioy.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvcmV5d3ZxdWFnZWxjbGdoaW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzU0ODcsImV4cCI6MjA5MjUxMTQ4N30.8MJ0jmdk_hVcyDtc2e6DpGQ12FUfLvnkCkRSsBB9MXg',
  VERSION: '5.0',
  PHASE: 'Phase 5.0',
};

// Supabase client (named `sb` to avoid conflict with the library global `supabase`)
PTL.sb = window.supabase.createClient(
  PTL.config.SUPABASE_URL,
  PTL.config.SUPABASE_ANON_KEY
);

// Global state shared across modules
PTL.state = {
  authUser: null,        // Supabase auth user object
  person: null,          // Linked person row
  personRoles: [],       // [{ role_id, roles: { ... } }]
  isSignupMode: false,   // login form toggle
};

// ----- Permission helpers ---------------------------------------------------
// Centralized role checks used everywhere in the UI to gate actions.
PTL.perms = {
  // Admin: full access to everything (manage team, edit workflow, settings)
  isAdmin() {
    return !!PTL.state.person?.is_admin;
  },
  // Manager: read-only access to all books + dashboard
  isManager() {
    return !!PTL.state.person?.is_manager;
  },
  // Can the current user perform write actions on books/tasks/etc?
  // Managers are explicitly view-only.
  canEdit() {
    if (!PTL.state.person) return false;
    if (PTL.state.person.is_manager && !PTL.state.person.is_admin) return false;
    return true;
  },
  // Only admins can manage team, edit workflow templates, change roles, etc.
  canManageSystem() {
    return this.isAdmin();
  },
};

// Routes registry (filled by router.js + page modules)
PTL.routes = {};

// Page modules registry
PTL.pages = {};

// Reusable components registry
PTL.components = {};

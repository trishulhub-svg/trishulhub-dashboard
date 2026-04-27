---
Task ID: 1
Agent: Main Agent
Task: Fix 4 issues reported by user on TrishulHub AI Agent Dashboard

Work Log:
- Analyzed screenshot showing "OpenRouter API error: 401 - User not found" on Dev Agent chat
- Identified root causes for all 4 issues
- Fixed API key DELETE handler (was reading from JSON body but frontend sent query param)
- Fixed agent chat route to properly handle API key selection and auto-assignment
- Added auto-failover: when API key gets 401, it's marked as ERROR and unlinked from agent
- Added API key test endpoint (/api/api-keys/test)
- Replaced all SVG logos with uploaded PNG logos (512px and 200px) across 4 files
- Removed Demo Accounts card from login page (showed IDs and passwords)
- Fixed logout redirect from localhost by using signOut({ redirect: false }) + manual router.push
- Reseeded database with placeholder key marked as ERROR status
- Added empty state for API Keys page with helpful guidance
- Added system message display for API key errors in agent chat

Stage Summary:
- Issue 1 (API delete + agent error): Fixed DELETE handler to read from query params, added auto-failover for invalid keys, agents auto-assign to valid keys
- Issue 2 (Logo): Replaced SVG trident logo with TH circular logo (512px for login, 200px for sidebar/portal)
- Issue 3 (ID/password on homescreen): Removed Demo Accounts card from login page
- Issue 5 (Logout localhost): Changed signOut to use redirect:false + manual navigation
- All fixes verified and app running successfully

🌿 Verdant Systems: Full Feature Documentation 

1. Core Architecture & Global Features 

 
**Multilingual Support**: Full localization for English, Chinese, Japanese, Korean, Spanish, French, and Portuguese.
 
**Role-Based Access Control (RBAC)**: Strict permission tiers (Owner, Director, Manager, Gardener, Seasonal) with time-fenced access for temporary staff.

**AI Integration**: Real-time botanical identification, care advice generation, and automated task scheduling powered by the Gemini API.
 
**Proxmox Synchronization**: Real-time data persistence and heartbeat monitoring between the client and the server node.
 
**PWA Ready**: Installable as a progressive web app with offline capabilities and push notifications.

---

2. Page-by-Page Feature Breakdown 

📊 Dashboard (`/`) 

**Specimen Overview**: A visual grid of all plants with high-contrast status badges (Stable, Soon, Thirsty).
 
**Hydration Monitoring**: Real-time progress bars showing soil moisture levels and days remaining until the next watering.
 
**Smart Search & Filter**: Filter by nickname, species, room, or category.
 
**Quick Actions**: One-tap watering logs and instant access to the AI identification camera.
 
**Health Indicators**: Visual alerts for toxic/pet-safe status and environmental stability.


💧 Care Schedule (`/care`) 
 
**Intelligent Queue**: Lists plants due for watering, sorted by urgency.
 
**Predictive Logic**: Calculates due dates by combining the standard watering interval with recent moisture sensor logs.
 
**Overdue Alerts**: Visual "Pulse" indicators for plants that have exceeded their hydration window.
 
**Notification Management**: Toggle for system-level push notifications for watering alerts.


📋 Task Management (`/tasks`) 
 
**Automated Generation**: The system automatically creates tasks for watering, weekly rotation, monthly fertilizing, and repotting.
 
**Manual Task Creation**: Ability to add custom one-off tasks for any specimen.
 
**Completion History**: Tracks who completed which task and when.


📦 Inventory & Formulas (`/inventory`) 

**Soil Mix Engine**: Create and store custom substrate formulas.
 
**Supply Tracking**: Monitor stock levels for pots, fertilizers, and raw substrates.
 
**Dual-Unit Logic**: Supports both Metric and Imperial measurements for volume and weight.


🏷️ Label Protocol (`/labels`) 
 
**QR Identification**: Generates unique QR codes for every specimen in the database.
 
**Printable Labels**: Formatted labels including the nickname, species, and unique system ID.


🏠 Property Management (`/locations`) 
 
**Multi-House Support**: Manage multiple physical properties.

**Room Categorization**: Organize specimens into specific rooms for better logistics.

---

3. Administrative & Security Protocols (`/admin`) 

🔑 Security & Vault 
 
**Master Encryption Key**: 256-bit encryption for all sensitive botanical and personnel data.
 
**Key Rotation**: Ability to rotate the master key to maintain high security standards.
 
**Strict Handshake Mode**: Ensures only authorized clients with valid tokens can communicate with the server.


💾 Database Management 
 
**System Backup**: Download a complete JSON snapshot of the entire operation.
 
**Encrypted Restore**: Restore the database from an encrypted .enc file using the Master Key.
 
**Decommissioning**: Securely delete specimens or properties with full audit logging.


👥 Personnel Management 
 
**Access Control**: Assign users to specific properties and define their roles.
 
**Audit Logs**: A real-time feed of all system events, including logins and data changes.


---

4. Specimen Deep-Dive (Plant Details) 
 
**Botanical Passport**: Detailed origin, family, and genus information.
 
**Technical Specs**: Optimal ranges for soil moisture, temperature, light (Lux), and humidity.
 
**Phenophase Tracking**: Logs for growth snapshots, repotting history, and health assessments.
 
**AI Care Uplink**: Dynamic care advice that updates as the plant matures.


---

5. Technical Documentation & Sync Protocol 

The PWA uses a "Near Real-Time" protocol for resilience.
 
**Immediate Local Updates**: The UI updates instantly (Optimistic UI) before waiting for server response.
 
**Background Handshake**: Immediate POST attempts are made to update the server following a change.
 
**Sync Heartbeat**: A 20-second polling cycle fetches the latest state for plants, houses, and tasks.
 
**Conflict Resolution**: Timestamp-based logic ensures the most recent data wins.
 
**Offline Persistence**: Data is mirrored in localStorage, allowing use without connection and re-syncing upon reconnection.


---

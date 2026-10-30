# Portable Applications Client

> **Original Proposal:** Refer to [`../docs/proposal.md`](../docs/proposal.md) for the original, combined proposal covering both the Server Application and Client Application.

## 1. Project Overview

The **Portable Applications Client** is a local network-based desktop application designed to allow users to browse, download, and launch portable applications and games distributed by a centralized server.

The application serves as the user-facing interface for an internet café or net café environment. It connects to the Portable Applications Server, retrieves the available application and game catalog, downloads requested files when necessary, extracts them locally, and launches the selected application or game.

The frontend will be built using **React, TypeScript, Vite, Tailwind CSS, and DaisyUI**, while Python will handle backend logic, file operations, application launching, and network communication.

PyWebView will provide the desktop interface, and PyInstaller will package the Python project into a standalone executable.

The Client Application must be portable and should rely on relative paths rather than hardcoded absolute paths. It should run from different directories without requiring a conventional installation process or manual path configuration.

## 2. Core Features and Requirements

### 2.1. Catalog Browsing

Provide a straightforward and user-friendly interface for browsing applications and games available from the server.

The catalog should display relevant information, including:
- Application or game title.
- Description.
- Thumbnail or cover image.
- Other available metadata.

The interface should make it easy for customers to identify and select the applications or games they want to use.

### 2.2. Server Communication

The client must communicate with the Portable Applications Server over the local area network (LAN).

Requirements include:
- Connect to the designated server.
- Retrieve the available application and game catalog.
- Request application or game files.
- Receive ZIP archives from the server.
- Handle communication and transfer errors appropriately.

### 2.3. Application Requests

Allow users to select an application or game from the catalog and initiate its launch.

When an application is selected, the client should determine whether its required files are already available locally and whether an update is necessary.

If the files are missing or outdated, the client should request the required files from the server before launching the application.

### 2.4. File Transfer and Extraction

The client must retrieve application and game files from the server and extract them into its designated local storage directory.

Requirements include:
- Download ZIP archives from the server.
- Extract downloaded archives into the appropriate application directory.
- Maintain an organized local directory structure.
- Handle incomplete or failed downloads.
- Avoid unnecessary downloads when the required files are already available and up to date.

### 2.5. Application and Game Launching

Allow users to launch applications and games directly from the client interface.

The client should:
- Locate the application's local directory.
- Read the configured relative executable path provided through the server catalog.
- Resolve the executable path relative to the application's local directory.
- Launch the selected executable.
- Handle missing executables or launch failures appropriately.

Users should not need to manually locate application directories or execute files through Windows File Explorer.

### 2.6. Local Application Storage

The client should maintain a designated directory for storing downloaded applications and games.

Requirements include:
- Store each application or game in an organized directory.
- Use relative paths wherever practical.
- Keep downloaded files separate from the Client Application's executable and runtime files when appropriate.
- Support portable operation regardless of the client's execution directory.
- Allow downloaded applications to be located and launched without requiring fixed installation paths.

### 2.7. Portable Operation

The Client Application must operate independently of its installation location.

Requirements include:
- No conventional installation process.
- No hardcoded installation directories.
- Relative paths for application data and local storage.
- Standalone executable packaging using PyInstaller.
- Compatibility with computers restored to a clean state after reboot.

## 3. Intended Use Case

The Client Application is intended for an internet café or net café business operating multiple computers connected to the same local area network.

Each client computer will run the Client Application and connect to one designated computer hosting the Portable Applications Server.

Client computers are typically provisioned with fresh operating system installations and only the software necessary to run the Client Application.

Deep Freeze or similar system-restoration software will be enabled to restore client computers to a clean state after each reboot, preventing users' changes and files from persisting between sessions.

The computers have relatively modest hardware specifications and are primarily used to play:
- Roblox.
- Warcraft III.
- Grand Theft Auto: San Andreas.
- Other classic PC games and portable applications.

The Client Application should make these applications and games easily accessible without requiring users to interact directly with the server or manually manage downloaded files.

## 4. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React |
| Programming Language | TypeScript |
| Build Tool | Vite |
| CSS Framework | Tailwind CSS |
| UI Components | DaisyUI |
| Backend | Python |
| Desktop Interface | PyWebView |
| Packaging | PyInstaller |
| Distribution Format | ZIP |
| Communication | Local Network (LAN) |

## 5. Expected Client Workflow

1. The customer opens the Client Application.
2. The client connects to the designated Portable Applications Server.
3. The client retrieves the available application and game catalog.
4. The customer browses the catalog and selects an application or game.
5. The client checks whether the required files are already available locally.
6. The client determines whether an update or download is necessary.
7. If necessary, the client requests the application or game files from the server.
8. The server packages and transfers the requested directory as a ZIP archive.
9. The client receives and extracts the archive into its designated local storage directory.
10. The client resolves the configured relative executable path.
11. The client launches the selected application or game.
12. When the computer reboots, Deep Freeze restores its protected state according to its configured policies.

## 6. Primary Objectives

### 6.1. Simple User Experience

Provide a straightforward interface that allows customers to browse and launch available applications and games with minimal assistance.

### 6.2. Automated Application Retrieval

Automatically retrieve application and game files from the server whenever they are missing or require updates.

### 6.3. Simplified Application Launching

Allow customers to launch applications and games directly from the catalog without manually navigating directories or locating executables.

### 6.4. Reduced Client Maintenance

Eliminate the need to manually install and update applications and games on every client computer.

### 6.5. Portable and Self-Contained Operation

Ensure the Client Application can run from different directories without relying on fixed installation locations or requiring a conventional installation process.

### 6.6. Efficient Local Network Usage

Retrieve application and game files from the local server rather than downloading them separately from the internet on every client computer.

## 7. Overall Goal

The goal of the Portable Applications Client is to provide a lightweight, portable, and user-friendly desktop application for accessing and launching applications and games distributed by a centralized server.

By combining catalog browsing, automated file retrieval, local extraction, and direct application launching, the client aims to provide customers with a convenient and consistent gaming experience while minimizing the administrative effort required to maintain multiple computers in a local net café environment.
# Portable Applications Server

> **Original Proposal:** Refer to [`../docs/proposal.md`](../docs/proposal.md) for the original, combined proposal covering both the Server Application and Client Application.

## 1. Project Overview

The **Portable Applications Server** is a local network-based desktop application designed to centrally manage and distribute portable applications and games to multiple client computers.

The application serves as the central management system for an internet café or net café environment. It allows administrators to maintain an application and game catalog, organize application files, configure executable paths, and distribute requested files to connected client computers over the local area network (LAN).

The frontend will be built using **React, TypeScript, Vite, Tailwind CSS, and DaisyUI**, while Python will handle backend logic, file management, and network communication.

PyWebView will provide the desktop interface, and PyInstaller will package the Python project into a standalone executable.

The Server Application must be portable and should rely on relative paths rather than hardcoded absolute paths. It should be capable of running from different directories without requiring installation or manual path configuration.

## 2. Core Features and Requirements

### 2.1. Application and Game Management

Provide an administrative interface for managing the applications and games available to client computers.

Features include:
- Add new applications and games to the catalog.
- Edit existing catalog entries.
- Remove applications and games.
- View and manage registered applications and games.
- Organize catalog entries for easier administration.

### 2.2. Metadata Management

Allow administrators to configure relevant information for each application or game.

Each catalog entry should support:
- Application or game title.
- Description.
- Thumbnail or cover image.
- Application directory.
- Relative executable path.
- Other relevant metadata as needed.

### 2.3. File Management

Provide functionality for organizing and managing the directories containing application and game files.

Requirements include:
- Associate each catalog entry with its corresponding application directory.
- Maintain organized storage for distributed applications and games.
- Use relative paths wherever practical.
- Ensure the application can locate its managed files regardless of its execution directory.

### 2.4. Network Distribution

The server will act as the central source of application and game files for all connected clients.

When a client requests an application or game:
1. Receive the client's request.
2. Locate the corresponding application directory.
3. Package the required directory into a ZIP archive.
4. Transfer the archive to the requesting client over the local network.
5. Complete the transfer and release temporary resources.

The server should support multiple client computers accessing its services within the local network.

### 2.5. Centralized Updates

Administrators should be able to update application and game files directly on the server.

Updated files should become available to clients through the distribution mechanism, eliminating the need to manually update every client computer.

### 2.6. Server Portability

The Server Application must operate independently of its installation location.

Requirements include:
- Use relative paths for application data and managed files.
- Avoid hardcoded installation directories.
- Keep application data organized within the server's designated directory structure.
- Support relocation and backup without requiring extensive reconfiguration.
- Package the application as a standalone executable using PyInstaller.

## 3. Intended Use Case

The Server Application is intended for an internet café or net café business operating multiple computers connected to the same local area network.

One designated computer will host the Server Application and serve as the central management and distribution system.

The environment primarily supports games such as:
- Roblox.
- Warcraft III.
- Grand Theft Auto: San Andreas.
- Other classic PC games and portable applications.

Client computers may have modest hardware specifications and are typically provisioned with fresh operating system installations.

The server should simplify the process of maintaining a consistent application and game catalog across all client computers.

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

## 5. Expected Server Workflow

1. The administrator opens the Server Application.
2. The administrator adds an application or game to the catalog.
3. The administrator specifies its title, description, thumbnail, directory, and executable path.
4. The server registers and maintains the catalog entry.
5. The server starts its network service and waits for client requests.
6. A client requests an application or game.
7. The server identifies the requested application directory.
8. The server packages the required files into a ZIP archive.
9. The server transfers the archive to the requesting client.
10. The server completes the request and remains available for additional clients.

## 6. Primary Objectives

### 6.1. Centralized Management

Provide a single administrative interface for managing applications and games distributed across multiple client computers.

### 6.2. Simplified Deployment and Updates

Allow administrators to add or update applications and games in one location, making them available to connected clients without manually maintaining individual installations.

### 6.3. Reduced Maintenance Overhead

Minimize repetitive administrative work by centralizing application storage, metadata, and distribution.

### 6.4. Efficient Local Network Distribution

Transfer application and game files through the local network instead of requiring every client computer to download the same files independently from the internet.

### 6.5. Portable Operation

Ensure the Server Application can be relocated, backed up, and executed without depending on fixed installation directories.

## 7. Overall Goal

The goal of the Portable Applications Server is to provide a lightweight, portable, and centralized solution for managing and distributing applications and games across multiple computers in a local net café environment.

By providing centralized catalog management, organized application storage, and automated ZIP-based network distribution, the server aims to simplify application deployment, reduce maintenance overhead, and provide a reliable source of applications and games for all connected client computers.
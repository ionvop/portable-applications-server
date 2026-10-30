# Portable Applications Server

## 1. Project Overview

The **Portable Applications Server** is a local network-based system designed to distribute and launch portable applications and games across multiple client computers from a centralized server.

The project consists of two desktop web applications: a **Server Application** for managing the application and game catalog, and a **Client Application** that allows users to browse, download, and launch available applications and games.

The frontend will be built using **React, TypeScript, Vite, Tailwind CSS, and DaisyUI**, with Python handling backend logic and network communication on both the server and client sides. Both applications will use PyWebView to provide a desktop interface and PyInstaller to package the Python projects into standalone executables.

When a client requests an application or game, the server will package its directory into a ZIP archive and transfer it over the local network. The client will extract the archive and launch the application using its configured executable path.

Both the server and client applications must be portable. They should rely on relative paths rather than hardcoded absolute paths to ensure they can run from different directories without requiring installation or manual path configuration.

## 2. System Components

### 2.1. Server Application

The Server Application is the central management interface for the system. It allows the administrator to maintain the catalog of available applications and games and manage the files distributed to client computers.

Key features include:

- **Application and game management:** Add, edit, and remove catalog entries.
- **Metadata management:** Configure each entry's title, description, thumbnail, and other relevant information.
- **Executable configuration:** Specify the relative path to the executable used to launch each application or game.
- **File management:** Organize and manage the directories containing application and game files.
- **Network distribution:** Package requested applications and games into ZIP archives and transfer them to clients over the local network.
- **Centralized updates:** Make new applications, games, or updated versions available to clients from a single computer.

The server will run on one designated computer within the local network and act as the central source for the application and game catalog.

### 2.2. Client Application

The Client Application is the user-facing interface installed on each client computer. It allows customers to browse the available catalog and launch their chosen applications or games without requiring direct access to the server's file system.

Key features include:

- **Catalog browsing:** Display available applications and games with their titles, thumbnails, and relevant details.
- **Application requests:** Allow users to select an application or game to download or launch.
- **File transfer and extraction:** Retrieve the requested application or game from the server and extract its files locally.
- **Application launching:** Launch the requested application using its configured relative executable path.
- **Portable operation:** Run without requiring a conventional installation process or hardcoded installation directories.

The client should provide a straightforward, user-friendly experience so customers can access available applications and games with minimal assistance.

## 3. Intended Use Case

The system is intended for a local internet café or net café business operating multiple computers on the same local area network (LAN).

A single computer will host the Server Application, while multiple client computers will run the Client Application.

The client computers are typically provisioned with fresh operating system installations and only the software necessary to run the client application. Deep Freeze or similar system-restoration software will be enabled to revert client computers to a clean state after each reboot, preventing users' changes and files from persisting between sessions.

The computers have relatively modest hardware specifications and are primarily used to play Roblox and classic PC games, such as Warcraft III and Grand Theft Auto: San Andreas.

The system is intended to simplify the management and distribution of these applications and games while minimizing the time and effort required to maintain multiple client computers.

## 4. Primary Objectives and Benefits

### 4.1. Centralized Application and Game Management

Administrators can manage the available applications and games from a single server instead of manually maintaining separate copies on every client computer.

### 4.2. Simplified Deployment and Updates

New applications, games, and updates can be added to the server and distributed to clients over the local network, reducing repetitive installation and maintenance tasks.

### 4.3. Reduced Maintenance Overhead

Centralizing application storage and distribution minimizes the need to configure each client computer individually, making it easier to maintain a consistent environment across all units.

### 4.4. Portable and Self-Contained Applications

Both the Server Application and Client Application should operate independently of their installation location, using relative paths wherever practical. This reduces dependence on fixed directory structures and simplifies deployment, backup, and relocation.

### 4.5. Efficient Use of Local Network Resources

Application and game files will be transferred over the local network rather than downloaded separately from the internet on every client computer. This can reduce external bandwidth usage and make deployment more convenient, particularly for large game directories.

## 5. Expected Workflow

1. The administrator adds an application or game to the server, specifying its directory, title, thumbnail, and executable path.
2. A customer opens the Client Application and browses the available catalog.
3. The customer selects an application or game to launch.
4. The client checks whether the required files are already available locally and whether an update is needed.
5. If necessary, the client requests the application or game files from the server.
6. The server packages the required directory into a ZIP archive and transfers it to the client.
7. The client extracts the files into its designated local storage directory.
8. The client launches the application or game using the configured executable path.
9. When the client computer reboots, Deep Freeze restores its protected state according to the configured policies.

## 6. Overall Goal

The goal of the Portable Applications Server is to provide a lightweight, centralized, and easy-to-maintain solution for distributing and launching applications and games across multiple computers in a local net café environment.

By combining a central file distribution server, a simple client catalog, portable desktop applications, and local network transfers, the system aims to reduce repetitive maintenance work, simplify game deployment and updates, and provide customers with a consistent gaming experience across all client computers.
# Backend

This is the backend for the DeFi Borrowed Positions application. It is an Express server written in TypeScript.

## Getting Started

To get the backend server running locally, follow these steps:

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

The server will start on `http://localhost:3001`. The `dev` script uses `tsx` to watch for changes and automatically restart the server.

## Available Scripts

-   `npm run dev`: Starts the development server with hot-reloading.
-   `npm run build`: Compiles the TypeScript code to JavaScript in the `dist` directory.
-   `npm run start`: Starts the production server from the compiled code in the `dist` directory.
-   `npm test`: Runs the test suite using Jest.
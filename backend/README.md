# Backend - Student Portal API

A well-organized Node.js/Express backend with TypeScript, featuring proper separation of concerns.

## Project Structure

```
backend/
├── src/
│   ├── controllers/     # Request handlers
│   │   ├── authController.ts
│   │   ├── studentController.ts
│   │   └── adminController.ts
│   ├── middleware/      # Custom middleware
│   │   ├── auth.ts
│   │   └── validation.ts
│   ├── routes/          # Route definitions
│   │   ├── auth.ts
│   │   ├── student.ts
│   │   ├── admin.ts
│   │   └── index.ts
│   ├── services/        # Business logic
│   │   ├── authService.ts
│   │   ├── database.ts
│   │   └── studentService.ts
│   ├── types/           # TypeScript interfaces
│   │   └── index.ts
│   ├── app.ts           # Express app configuration
│   └── server.ts        # Server startup
├── index.ts             # Entry point
├── package.json
└── tsconfig.json
```

## Architecture

### **Controllers** (`/controllers`)
- Handle HTTP requests and responses
- Call appropriate services
- Return formatted responses
- Handle errors gracefully

### **Services** (`/services`)
- Contain business logic
- Handle database operations
- Manage external API calls
- Reusable across controllers

### **Middleware** (`/middleware`)
- Authentication and authorization
- Request validation
- Error handling
- Logging and monitoring

### **Routes** (`/routes`)
- Define API endpoints
- Apply middleware
- Connect to controllers
- Organize by feature

### **Types** (`/types`)
- TypeScript interfaces
- Request/response types
- Database model types
- Shared type definitions

## Key Features

- 🔐 **JWT Authentication** with role-based access control
- 🗄️ **PostgreSQL** with connection pooling
- 🛡️ **Input Validation** and sanitization
- 📝 **TypeScript** for type safety
- 🏗️ **Modular Architecture** for scalability
- 🚀 **Graceful Shutdown** handling

## API Endpoints

### Authentication
- `POST /api/student/login` - Student login
- `POST /api/admin/login` - Admin login

### Student Routes (Protected)
- `GET /api/student/dashboard` - Student dashboard
- `GET /api/student/profile` - Student profile

### Admin Routes (Protected)
- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/stats` - System statistics

### Student Management (Admin Only)
- `GET /api/student` - Get all students
- `GET /api/student/:id` - Get student by ID

## Getting Started

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Start Development Server**
   ```bash
   bun run dev
   ```

3. **Build for Production**
   ```bash
   bun run build
   ```

## Environment Variables

```env
PORT=3001
JWT_SECRET=your-secret-key-here
DB_USER=postgres
DB_HOST=localhost
DB_NAME=studentportal
DB_PASSWORD=your-password
DB_PORT=5432
```

## Database Connection

The backend automatically tests the database connection on startup and provides detailed logging about the connection status.

## Error Handling

- Centralized error handling
- Proper HTTP status codes
- Detailed error messages for debugging
- Graceful fallbacks

## Security Features

- Password hashing with bcrypt
- JWT token validation
- Role-based access control
- Input sanitization
- CORS configuration

## Development

- Hot reloading with `bun run dev`
- TypeScript compilation
- Source maps for debugging
- Clean build process

## Production Considerations

- Use environment variables for secrets
- Enable HTTPS in production
- Set up proper logging
- Configure rate limiting
- Set up monitoring and health checks

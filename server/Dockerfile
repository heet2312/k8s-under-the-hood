# Base image
FROM node:20-alpine

# Set environment to production
ENV NODE_ENV=production

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package files first for dependency caching
COPY --chown=node:node package*.json ./

# Install ONLY production dependencies (clean install, omitting devDependencies)
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the application files with node owner privileges
COPY --chown=node:node . .

# Switch container context to the non-root user for security
USER node

# Expose the Express server port
EXPOSE 5000

# Start the application in production mode
# We execute node directly (instead of npm start) to ensure OS signals 
# (like SIGTERM/SIGINT) are forwarded correctly for graceful shutdowns.
CMD ["node", "src/index.js"]

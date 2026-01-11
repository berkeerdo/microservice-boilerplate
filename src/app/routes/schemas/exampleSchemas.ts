/**
 * Example API Schemas
 * JSON Schema definitions for Swagger/OpenAPI documentation
 */

export const exampleSchemas = {
  // Response: Single example
  example: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  // Response: Paginated list
  exampleList: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      total: { type: 'integer' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
  },

  // Response: Created example
  exampleCreated: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // Response: Updated example
  exampleUpdated: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  // Response: Delete success
  deleteSuccess: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      id: { type: 'integer' },
    },
  },

  // Response: Error
  error: {
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },

  // Params: ID
  idParam: {
    type: 'object',
    properties: {
      id: { type: 'integer', description: 'Example ID' },
    },
    required: ['id'],
  },

  // Query: Pagination
  listQuery: {
    type: 'object',
    properties: {
      limit: { type: 'integer', default: 20, description: 'Items per page' },
      offset: { type: 'integer', default: 0, description: 'Items to skip' },
    },
  },

  // Body: Create
  createBody: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },

  // Body: Update
  updateBody: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
} as const;

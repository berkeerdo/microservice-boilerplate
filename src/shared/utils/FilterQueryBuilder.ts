/**
 * FilterQueryBuilder
 *
 * Generic, fluent query builder for SQL WHERE conditions.
 * Eliminates repeated filter building patterns across repositories.
 *
 * Usage:
 * ```typescript
 * const { sql, params } = new FilterQueryBuilder()
 *   .equals('brand_id', filters.brandId)
 *   .equals('is_active', filters.isActive)
 *   .gte('created_at', filters.startDate)
 *   .lte('created_at', filters.endDate)
 *   .in('status', filters.statuses)
 *   .like('name', filters.search)
 *   .build();
 * ```
 */

export interface QueryCondition {
  sql: string;
  params: unknown[];
}

export class FilterQueryBuilder {
  private conditions: string[] = [];
  private params: unknown[] = [];
  private tableAlias?: string;

  /**
   * Set table alias for all conditions (e.g., 'k' for 'k.brand_id = ?')
   */
  withAlias(alias: string): this {
    this.tableAlias = alias;
    return this;
  }

  /**
   * Get column name with optional alias
   */
  private col(column: string): string {
    return this.tableAlias ? `${this.tableAlias}.${column}` : column;
  }

  /**
   * Equals condition: column = ?
   */
  equals(column: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions.push(`${this.col(column)} = ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Not equals condition: column != ?
   */
  notEquals(column: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions.push(`${this.col(column)} != ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Greater than condition: column > ?
   */
  gt(column: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions.push(`${this.col(column)} > ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Greater than or equal condition: column >= ?
   */
  gte(column: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions.push(`${this.col(column)} >= ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Less than condition: column < ?
   */
  lt(column: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions.push(`${this.col(column)} < ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Less than or equal condition: column <= ?
   */
  lte(column: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions.push(`${this.col(column)} <= ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * LIKE condition: column LIKE ?
   * Automatically adds % wildcards if not present
   */
  like(
    column: string,
    value: string | undefined | null,
    mode: 'contains' | 'starts' | 'ends' | 'exact' = 'contains'
  ): this {
    if (value !== undefined && value !== null && value.trim() !== '') {
      let pattern: string;
      switch (mode) {
        case 'starts':
          pattern = `${value}%`;
          break;
        case 'ends':
          pattern = `%${value}`;
          break;
        case 'exact':
          pattern = value;
          break;
        case 'contains':
        default:
          pattern = `%${value}%`;
      }
      this.conditions.push(`${this.col(column)} LIKE ?`);
      this.params.push(pattern);
    }
    return this;
  }

  /**
   * IN condition: column IN (?, ?, ...)
   */
  in(column: string, values: unknown[] | undefined | null): this {
    if (values && values.length > 0) {
      const placeholders = values.map(() => '?').join(', ');
      this.conditions.push(`${this.col(column)} IN (${placeholders})`);
      this.params.push(...values);
    }
    return this;
  }

  /**
   * NOT IN condition: column NOT IN (?, ?, ...)
   */
  notIn(column: string, values: unknown[] | undefined | null): this {
    if (values && values.length > 0) {
      const placeholders = values.map(() => '?').join(', ');
      this.conditions.push(`${this.col(column)} NOT IN (${placeholders})`);
      this.params.push(...values);
    }
    return this;
  }

  /**
   * IS NULL condition: column IS NULL
   */
  isNull(column: string, shouldBeNull = true): this {
    if (shouldBeNull) {
      this.conditions.push(`${this.col(column)} IS NULL`);
    }
    return this;
  }

  /**
   * IS NOT NULL condition: column IS NOT NULL
   */
  isNotNull(column: string, shouldNotBeNull = true): this {
    if (shouldNotBeNull) {
      this.conditions.push(`${this.col(column)} IS NOT NULL`);
    }
    return this;
  }

  /**
   * BETWEEN condition: column BETWEEN ? AND ?
   */
  between(column: string, start: unknown, end: unknown): this {
    if (start !== undefined && start !== null && end !== undefined && end !== null) {
      this.conditions.push(`${this.col(column)} BETWEEN ? AND ?`);
      this.params.push(start, end);
    }
    return this;
  }

  /**
   * Date range condition using >= and <=
   * More flexible than BETWEEN for date handling
   */
  dateRange(
    column: string,
    startDate?: Date | string | null,
    endDate?: Date | string | null
  ): this {
    if (startDate) {
      this.conditions.push(`${this.col(column)} >= ?`);
      this.params.push(startDate);
    }
    if (endDate) {
      this.conditions.push(`${this.col(column)} <= ?`);
      this.params.push(endDate);
    }
    return this;
  }

  /**
   * Custom raw condition with parameters
   * Use for complex conditions that don't fit other methods
   */
  raw(condition: string, params: unknown[] = []): this {
    if (condition) {
      this.conditions.push(condition);
      this.params.push(...params);
    }
    return this;
  }

  /**
   * Conditional builder - only adds condition if predicate is true
   */
  when<T>(value: T | undefined | null, builder: (qb: this, value: T) => this): this {
    if (value !== undefined && value !== null) {
      return builder(this, value);
    }
    return this;
  }

  /**
   * Add soft delete exclusion condition
   */
  excludeDeleted(deletedAtColumn = 'deleted_at'): this {
    this.conditions.push(`${this.col(deletedAtColumn)} IS NULL`);
    return this;
  }

  /**
   * Check if any conditions have been added
   */
  hasConditions(): boolean {
    return this.conditions.length > 0;
  }

  /**
   * Get the number of conditions
   */
  count(): number {
    return this.conditions.length;
  }

  /**
   * Build the final SQL and params
   * @param joinWith - Connector between conditions (default: ' AND ')
   */
  build(joinWith = ' AND '): QueryCondition {
    return {
      sql: this.conditions.join(joinWith),
      params: this.params,
    };
  }

  /**
   * Build with WHERE prefix if conditions exist
   */
  buildWithWhere(joinWith = ' AND '): QueryCondition {
    const { sql, params } = this.build(joinWith);
    return {
      sql: sql ? ` WHERE ${sql}` : '',
      params,
    };
  }

  /**
   * Build with AND prefix (for appending to existing WHERE)
   */
  buildWithAnd(joinWith = ' AND '): QueryCondition {
    const { sql, params } = this.build(joinWith);
    return {
      sql: sql ? ` AND ${sql}` : '',
      params,
    };
  }

  /**
   * Clone the builder for branching
   */
  clone(): FilterQueryBuilder {
    const cloned = new FilterQueryBuilder();
    cloned.conditions = [...this.conditions];
    cloned.params = [...this.params];
    cloned.tableAlias = this.tableAlias;
    return cloned;
  }

  /**
   * Static factory for cleaner syntax
   */
  static create(alias?: string): FilterQueryBuilder {
    const builder = new FilterQueryBuilder();
    if (alias) {
      builder.withAlias(alias);
    }
    return builder;
  }
}

// Re-export QueryCondition type
export type { QueryCondition as FilterCondition };

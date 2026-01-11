/**
 * Example Domain Model
 * Replace this with your actual domain models
 */
export class Example {
  private _id: number;
  private _name: string;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(data: { id?: number; name: string; createdAt?: Date; updatedAt?: Date }) {
    this._id = data.id ?? 0;
    this._name = data.name;
    this._createdAt = data.createdAt ?? new Date();
    this._updatedAt = data.updatedAt ?? new Date();
  }

  // Getters
  get id(): number {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // Factory method
  static create(data: { name: string }): Example {
    return new Example({ name: data.name });
  }

  // Domain methods
  updateName(name: string): void {
    this._name = name;
    this._updatedAt = new Date();
  }

  // Convert to persistence format
  toPersistence(): Record<string, unknown> {
    return {
      id: this._id,
      name: this._name,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

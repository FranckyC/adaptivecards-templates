import { JSONResponse, IUser, ITemplate, SortBy, SortOrder } from "../models/models";
import { StorageProvider } from "./IStorageProvider";
import uuidv4 from "uuid/v4";

export class InMemoryDBProvider implements StorageProvider {
  users: Map<string, IUser> = new Map();
  templates: Map<string, ITemplate> = new Map();

  constructor() {}

  private _updateUser(user: IUser, updateQuery: Partial<IUser>): void {
    this.users.set(user._id!, { ...user, ...updateQuery });
  }

  private _updateTemplate(template: ITemplate, updateQuery: Partial<ITemplate>): void {
    this.templates.set(template._id!, { ...template, ...updateQuery });
  }

  async updateUser(query: Partial<IUser>, updateQuery: Partial<IUser>): Promise<JSONResponse<Number>> {
    let updateCount: number = 0;
    await this._matchUsers(query).then(response => {
      if (response.success) {
        response.result!.forEach(user => {
          updateCount += 1;
          this._updateUser(user, this._clone(updateQuery));
        });
      }
    });
    if (updateCount) {
      return Promise.resolve({ success: true, result: updateCount });
    }
    return Promise.resolve({
      success: false,
      errorMessage: "No users found matching given criteria"
    });
  }
  async updateTemplate(query: Partial<ITemplate>, updateQuery: Partial<ITemplate>): Promise<JSONResponse<Number>> {
    let updateCount: number = 0;
    let response = await this._matchTemplates(query);
    if (response.success) {
      response.result!.forEach(template => {
        updateCount += 1;
        this._updateTemplate(template, this._clone(updateQuery));
      });
    }
    if (updateCount) {
      return Promise.resolve({ success: true, result: updateCount });
    }
    return Promise.resolve({
      success: false,
      errorMessage: "No templates found matching given criteria"
    });
  }

  async insertUser(doc: IUser): Promise<JSONResponse<string>> {
    return this._insert(doc, this.users);
  }

  async insertTemplate(doc: ITemplate): Promise<JSONResponse<string>> {
    this._setTimestamps(doc);
    return this._insert(doc, this.templates);
  }

  async getUsers(query: Partial<IUser>): Promise<JSONResponse<IUser[]>> {
    return this._matchUsers(query);
  }

  async getTemplates(
    query: Partial<ITemplate>,
    sortBy: SortBy = SortBy.alphabetical,
    sortOrder: SortOrder = SortOrder.ascending
  ): Promise<JSONResponse<ITemplate[]>> {
    return this._matchTemplates(query, sortBy, sortOrder);
    // return await this._matchTemplates(query, sortBy, sortOrder).then(result => {
    //   if (result.success) {
    //     // result.result?.sort(this.sortByField<T>, SortBy.alphabetical, SortOrder.ascending);
    //     return Promise.resolve({ sucess: result.success, result: result.result });
    //   }
    //   return Promise.resolve({ success: result.success, errorMessage: result.errorMessage }) as Promise<JSONResponse<ITemplate[]>>;
  }

  // Will be fixed in a while to use JSONResponse
  async removeUser(query: Partial<ITemplate>): Promise<JSONResponse<Number>> {
    let removeCount: number = 0;
    await this._matchUsers(query).then(response => {
      response.result!.forEach(user => {
        removeCount += 1;
        this.users.delete(user._id!);
      });
    });
    if (removeCount) {
      return Promise.resolve({ success: true, result: removeCount });
    }
    return Promise.resolve({
      success: false,
      errorMessage: "No users found matching given criteria"
    });
  }
  async removeTemplate(query: Partial<ITemplate>): Promise<JSONResponse<Number>> {
    let removeCount: number = 0;
    await this._matchTemplates(query).then(response => {
      if (response.success) {
        response.result!.forEach(template => {
          removeCount += 1;
          this.templates.delete(template._id!);
        });
      }
    });

    if (removeCount) {
      return Promise.resolve({ success: true, result: removeCount });
    }
    return Promise.resolve({
      success: false,
      errorMessage: "No users found matching given criteria"
    });
  }

  protected async _matchUsers(query: Partial<ITemplate>): Promise<JSONResponse<IUser[]>> {
    let res: IUser[] = new Array();
    this.users.forEach(user => {
      if (this._matchUser(query, user)) {
        res.push(this._clone(user));
      }
    });
    if (res.length) {
      return Promise.resolve({ success: true, result: res });
    }
    return Promise.resolve({ success: false });
  }

  private _sortByField<T>(sortBy: keyof T, sortOrder: SortOrder): (a: T, b: T) => number {
    return (a: T, b: T): number => {
      var result = a[sortBy] < b[sortBy] ? -1 : a[sortBy] > b[sortBy] ? 1 : 0;
      return result * sortOrder;
    };
  }

  protected async _matchTemplates(query: Partial<ITemplate>, sortBy?: SortBy, sortOrder?: SortOrder): Promise<JSONResponse<ITemplate[]>> {
    let res: ITemplate[] = new Array();
    this.templates.forEach(template => {
      if (this._matchTemplate(query, template)) {
        res.push(this._clone(template));
      }
    });
    if (res.length) {
      if (sortBy && sortOrder) {
        res.sort(this._sortByField(sortBy, sortOrder));
      }
      return Promise.resolve({ success: true, result: res });
    }
    return Promise.resolve({ success: false });
  }

  protected _clone<T>(obj: T): T {
    let cloned: T = JSON.parse(JSON.stringify(obj));
    return cloned;
  }

  protected async _insert<T extends ITemplate | IUser>(doc: T, collection: Map<String, T>): Promise<JSONResponse<string>> {
    let docToInsert: T = this._clone(doc);
    this._setID(docToInsert);
    if (!collection.has(docToInsert._id!)) {
      collection.set(docToInsert._id!, docToInsert);
      return Promise.resolve({ success: true, result: docToInsert._id });
    } else {
      return Promise.resolve({
        success: false,
        errorMessage: "Object with id: " + doc._id! + "already exists. Insertion failed"
      });
    }
  }

  // Makes sure that id of the object is set
  protected _setID<T extends ITemplate | IUser>(doc: T) {
    if (!doc._id) {
      doc._id = uuidv4();
    }
  }

  protected _setTimestamps(doc: ITemplate): void {
    doc.createdAt = new Date(Date.now());
    doc.updatedAt = new Date(Date.now());
  }

  protected _matchUser(query: Partial<IUser>, user: IUser): boolean {
    if (
      (query._id && !(query._id === user._id)) ||
      (query.authId && !(query.authId === user.authId)) ||
      (query.issuer && !(query.issuer === user.issuer)) ||
      (query.org && user.org && !this._ifContainsList(user.org, query.org)) ||
      (query.team && user.team && !this._ifContainsList(user.team, query.team))
    ) {
      return false;
    }
    return true;
  }

  protected _ifContainsList<T>(toVerify: T[], list: T[]): boolean {
    if (!list.length) {
      if (!toVerify.length) {
        return true;
      } else {
        return false;
      }
    }
    for (let obj of list) {
      if (!toVerify.includes(obj)) {
        return false;
      }
    }
    return true;
  }
  // Omitted version search for now
  // Add name search
  protected _matchTemplate(query: Partial<ITemplate>, template: ITemplate): boolean {
    if (
      (query.name && !template.name.includes(query.name)) ||
      (query.owner && !(query.owner === template.owner)) ||
      (query._id && !(query._id === template._id)) ||
      (query.isPublished && !(query.isPublished === template.isPublished)) ||
      (query.tags && template.tags && !this._ifContainsList(template.tags, query.tags))
    ) {
      return false;
    }
    return true;
  }

  async connect(): Promise<JSONResponse<Boolean>> {
    return Promise.resolve({ success: true });
  }
  async close(): Promise<JSONResponse<Boolean>> {
    return Promise.resolve({ success: true });
  }
}

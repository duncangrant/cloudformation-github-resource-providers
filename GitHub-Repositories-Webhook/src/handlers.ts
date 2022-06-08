import {
    Action,
    BaseResource,
    exceptions,
    handlerEvent,
    LoggerProxy,
    OperationStatus,
    Optional,
    ProgressEvent,
    ResourceHandlerRequest,
    SessionProxy,
} from '@amazon-web-services-cloudformation/cloudformation-cli-typescript-lib';
import {ResourceModel} from './models';
import {Octokit} from "@octokit/rest";
import {OctokitResponse} from "@octokit/types"
import {isOctokitRequestError} from "../../Common/util";

interface CallbackContext extends Record<string, any> {}

class Resource extends BaseResource<ResourceModel> {

    public handleError(response: OctokitResponse<any>, request: ResourceHandlerRequest<ResourceModel>) {
        if (!isOctokitRequestError(response)) {
            throw new exceptions.InternalFailure();
        } else if (response.status === 400) {
            throw new exceptions.AlreadyExists(this.typeName, request.logicalResourceIdentifier);
        } else if (response.status === 401) {
            throw new exceptions.AccessDenied();
        } else if (response.status === 403) {
            throw new exceptions.AccessDenied();
        } else if (response.status === 404) {
            throw new exceptions.NotFound(this.typeName, request.logicalResourceIdentifier);
        } else if (response.status === 422) {
            throw new exceptions.AlreadyExists(this.typeName, request.logicalResourceIdentifier);
        } else if (response.status > 400) {
            throw new exceptions.InternalFailure();
        }
        throw new exceptions.InternalFailure();
    }

    /**
     * CloudFormation invokes this handler when the resource is initially created
     * during stack create operations.  See https://docs.github.com/en/rest/webhooks/repos#create-a-repository-webhook
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Create)
    public async create(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const requestModel = new ResourceModel(request.desiredResourceState);

        const responseModel = await this.createWebhook(requestModel, request,  logger);

        return ProgressEvent.success<ProgressEvent<ResourceModel, CallbackContext>>(responseModel);
    }

    private async createWebhook(model: ResourceModel, request: ResourceHandlerRequest<ResourceModel>, logger: LoggerProxy) {
        const octokit = new Octokit({
            auth: model.gitHubAccess
        });
        let response: OctokitResponse<any>;
        try {
            response = await octokit.request(`POST /repos/{owner}/{repo}/hooks`, {
                owner: model.owner,
                repo: model.repository,
                name: model.name,
                active: model.active,
                events: [...model.events],
                config: {...model.config}
            });
        } catch (e) {
            this.handleError(e, request);
        }

        return Resource.createResponseModel(model, response.data);
    }

    /**
     * CloudFormation invokes this handler when the resource is updated
     * as part of a stack update operation.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Update)
    public async update(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const requestModel = new ResourceModel(request.desiredResourceState);

        const responseModel = await this.updateWebhook(requestModel, request,  logger);

        return ProgressEvent.success<ProgressEvent<ResourceModel, CallbackContext>>(responseModel);
    }

    /**
     * CloudFormation invokes this handler when the resource is deleted, either when
     * the resource is deleted from the stack as part of a stack update operation,
     * or the stack itself is deleted.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Delete)
    public async delete(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const model = new ResourceModel(request.desiredResourceState);

        await this.deleteWebhook(model, request, logger);

        return ProgressEvent.success<ProgressEvent<ResourceModel, CallbackContext>>();
    }

    /**
     * CloudFormation invokes this handler as part of a stack update operation when
     * detailed information about the resource's current state is required.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.Read)
    public async read(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const requestModel = new ResourceModel(request.desiredResourceState);

        const responseModel = await this.readWebhook(requestModel, request, logger);

        return ProgressEvent.success<ProgressEvent<ResourceModel, CallbackContext>>(responseModel);
    }

    /**
     * CloudFormation invokes this handler when summary information about multiple
     * resources of this resource provider is required.
     *
     * @param session Current AWS session passed through from caller
     * @param request The request object for the provisioning request passed to the implementor
     * @param callbackContext Custom context object to allow the passing through of additional
     * state or metadata between subsequent retries
     * @param logger Logger to proxy requests to default publishers
     */
    @handlerEvent(Action.List)
    public async list(
        session: Optional<SessionProxy>,
        request: ResourceHandlerRequest<ResourceModel>,
        callbackContext: CallbackContext,
        logger: LoggerProxy
    ): Promise<ProgressEvent<ResourceModel, CallbackContext>> {
        const requestModel = new ResourceModel(request.desiredResourceState);

        const responseModels = await this.listWebhooks(requestModel, request, logger);

        return ProgressEvent.builder<ProgressEvent<ResourceModel, CallbackContext>>()
            .status(OperationStatus.Success)
            .resourceModels(responseModels).build();
    }

    private async deleteWebhook(model: ResourceModel, request: ResourceHandlerRequest<ResourceModel>, logger: LoggerProxy) {
        const octokit = new Octokit({
            auth: model.gitHubAccess
        });
        let response: OctokitResponse<any>;
        try {
            response = await octokit.request(`DELETE /repos/{owner}/{repo}/hooks/{hook_id}`, {
                owner: model.owner,
                repo: model.repository,
                hook_id: model.id
            });
        } catch (e) {
            this.handleError(e, request);
        }
        return response;
    }

    private async readWebhook(model: ResourceModel, request: ResourceHandlerRequest<ResourceModel>, logger: LoggerProxy) {
        const octokit = new Octokit({
            auth: model.gitHubAccess
        });
        let response: OctokitResponse<any>;
        try {
            response = await octokit.request(`GET /repos/{owner}/{repo}/hooks/{hook_id}`, {
                owner: model.owner,
                repo: model.repository,
                hook_id: model.id
            });
        } catch (e) {
            this.handleError(e, request);
        }
        return Resource.createResponseModel(model, response.data);
    }

    private static createResponseModel(model: ResourceModel, data: any) {
        let config = data.config;
        delete config.secret;
        return new ResourceModel({
            ...model,
            id: data.id,
            active: data.active,
            events: data.events,
            config: config
        });
    }

    private async listWebhooks(model: ResourceModel, request: ResourceHandlerRequest<ResourceModel>, logger: LoggerProxy) {
        const octokit = new Octokit({
            auth: model.gitHubAccess
        });
        let models: any;
        try {
            models = await octokit.paginate(`GET /repos/{owner}/{repo}/hooks`, {
                owner: model.owner,
                repo: model.repository
            },response => response.data.map(repoItem => {
                let resourceModel = new ResourceModel(repoItem);
                delete repoItem.config.secret;
                return resourceModel;
            }));
        } catch (e) {
            this.handleError(e, request);
        }

        return models;
    }

    private async updateWebhook(model: ResourceModel, request: ResourceHandlerRequest<ResourceModel>, logger: LoggerProxy) {
        const octokit = new Octokit({
            auth: model.gitHubAccess
        });
        let response: OctokitResponse<any>;
        try {
            response = await octokit.request(`PATCH /repos/{owner}/{repo}/hooks/{hook_id}`, {
                owner: model.owner,
                repo: model.repository,
                hook_id: model.id,
                name: model.name,
                active: model.active,
                events: [...model.events],
                config: {url: model.config.url, secret: model.config.secret, content_type: model.config.contentType, insecure_ssl: model.config.insecureSsl}
            });
        } catch (e) {
            this.handleError(e, request);
        }

        return Resource.createResponseModel(model, response.data);
    }
}

export const resource = new Resource(ResourceModel.TYPE_NAME, ResourceModel);

// Entrypoint for production usage after registered in CloudFormation
export const entrypoint = resource.entrypoint;

// Entrypoint used for local testing
export const testEntrypoint = resource.testEntrypoint;

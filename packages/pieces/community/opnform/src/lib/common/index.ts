import {
  Property,
  DropdownOption,
} from '@activepieces/pieces-framework';
import {
  HttpRequest,
  HttpMethod,
  AuthenticationType,
  httpClient,
} from '@activepieces/pieces-common';

export const API_URL_DEFAULT = 'https://api.opnform.com';

type WorkspaceListResponse = {
  id: string;
  name: string;
}[];

type FormListResponse = {
  meta: {
    current_page: number;
    from: number; 
    last_page: number;
    per_page: number;
    to: number;
    total: number;
  };
  data: {
    id: string;
    title: string;
    slug?: string;
  }[];
};

export const workspaceIdProp = Property.Dropdown<string>({
  displayName: 'Workspace',
  description: 'Workspace Name',
  required: true,
  refreshers: [],
  async options({ auth }) {
    if (!auth) {
      return {
        disabled: true,
        placeholder: 'Connect Opnform account',
        options: [],
      };
    }

    const accessToken = (auth as any).apiKey;
    const options: DropdownOption<string>[] = [];

    const request: HttpRequest = {
      method: HttpMethod.GET,
      url: `${opnformCommon.getBaseUrl(auth)}/open/workspaces`,
      authentication: {
        type: AuthenticationType.BEARER_TOKEN,
        token: accessToken,
      }
    };

    const response = await httpClient.sendRequest<WorkspaceListResponse>(request);

    for (const workspace of response.body) {
      options.push({ label: workspace.name, value: workspace.id });
    }

    return {
      disabled: false,
      placeholder: 'Select workspace',
      options,
    };
  },
});

export const formIdProp = Property.Dropdown<string>({
  displayName: 'Form',
  description: 'Form Name',
  required: true,
  refreshers: ['workspaceId'],
  async options({ auth, workspaceId }) {
    if (!auth) {
      return {
        disabled: true,
        placeholder: 'Connect Opnform account',
        options: [],
      };
    }
    
    if (!workspaceId) {
      return {
        disabled: true,
        placeholder: 'Select workspace',
        options: [],
      };
    }

    try {
      const accessToken = (auth as any).apiKey;

      const options: DropdownOption<string>[] = [];
      let hasMore = true;
      let page = 1;

      do {
        const request: HttpRequest = {
          method: HttpMethod.GET,
          url: `${opnformCommon.getBaseUrl(auth)}/open/workspaces/${workspaceId}/forms`,
          authentication: {
            type: AuthenticationType.BEARER_TOKEN,
            token: accessToken,
          },
          queryParams: {
            page: page.toString(),
          },
        };

        const response = await httpClient.sendRequest<FormListResponse>(request);

        if (!response.body.data) {
          break;
        }

        for (const form of response.body.data) {
          options.push({ label: form.title, value: form.id });
        }

        hasMore =
          response.body.meta != undefined &&
          response.body.meta.current_page < response.body.meta.last_page;

        page++;
      } while (hasMore);

      return {
        disabled: false,
        placeholder: 'Select form',
        options,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        disabled: true,
        placeholder: `Failed to load forms: ${errorMessage}`,
        options: [],
      };
    }
  },
});

export const opnformCommon = {
  getBaseUrl: (auth: any) => {
    return auth.baseApiUrl || API_URL_DEFAULT;
  },
  validateAuth: async (auth: any) => {
    const response = await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: `${opnformCommon.getBaseUrl(auth)}/open/workspaces`,
      authentication: {
        type: AuthenticationType.BEARER_TOKEN,
        token: (auth as any).apiKey,
      },
    });
    return response.status === 200;
  },
  checkExistsIntegration: async (
    auth: any,
    formId: string,
    flowUrl: string,
  ) => {
    try {
      // Fetch all integrations for this form
      const allIntegrations = await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `${opnformCommon.getBaseUrl(auth)}/open/forms/${formId}/integrations`,
        authentication: {
          type: AuthenticationType.BEARER_TOKEN,
          token: (auth as any).apiKey,
        },
      });
      
      const integration = allIntegrations.body.find((integration: any) =>
        integration.integration_id === 'activepieces' && integration.data?.provider_url === flowUrl
      );
      
      return integration ? integration.id : null;
    } catch (error) {
      console.error('Error checking existing integration:', error);
      return null;
    }
  },
  createIntegration: async (
    auth: any,
    formId: string,
    webhookUrl: string,
    flowUrl: string,
  ) => {
    try {
      // Check if the integration already exists
      const existingIntegrationId = await opnformCommon.checkExistsIntegration(auth, formId, flowUrl);
      if(existingIntegrationId){
        console.log(`Integration already exists with ID: ${existingIntegrationId}`);
        return existingIntegrationId;
      }

      const request: HttpRequest = {
        method: HttpMethod.POST,
        url: `${opnformCommon.getBaseUrl(auth)}/open/forms/${formId}/integrations`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          'integration_id': 'activepieces',
          'status': 'active',
          'data': {
            'webhook_url': webhookUrl,
            'provider_url': flowUrl
          }
        },
        authentication: {
          type: AuthenticationType.BEARER_TOKEN,
          token: (auth as any).apiKey,
        },
        queryParams: {},
      };

      const response = await httpClient.sendRequest(request);
      const integrationId = (response as any)?.form_integration?.id as number || null;
      if (!integrationId) {
        throw new Error('Failed to get integration ID from response');
      }
      console.log(`Integration created with ID: ${integrationId}`);
      return integrationId;
    } catch (error) {
      console.error('Error creating integration:', error);
      throw error;
    }
  },
  deleteIntegration: async (
    auth: any,
    formId: string,
    integrationId: number,
  ) => {
    try {
      const request: HttpRequest = {
        method: HttpMethod.DELETE,
        url: `${opnformCommon.getBaseUrl(auth)}/open/forms/${formId}/integrations/${integrationId}`,
        headers: {
          'Content-Type': 'application/json',
        },
        authentication: {
          type: AuthenticationType.BEARER_TOKEN,
          token: (auth as any).apiKey,
        },
      };
      
      const response = await httpClient.sendRequest(request);
      console.log(`Integration deleted with ID: ${integrationId}`);
      return response;
    } catch (error) {
      console.error(`Error deleting integration ${integrationId}:`, error);
      throw error;
    }
  },
};

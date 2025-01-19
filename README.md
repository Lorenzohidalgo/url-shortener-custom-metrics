# URL Shortner with Custom metrics

This repository contains the sample application developed as part of the following [published article](https://lhidalgo.dev/url-shortener-custom-metrics)

## Requirements
In order to be able to deploy and use this application without requireing any changes you'll need:
* Node JS
* [CDK & Bootstrapped AWS Account](https://docs.aws.amazon.com/cdk/v2/guide/hello_world.html#hello_world_bootstrap)
* A Custom Domain and a configured Route 53 Hosted Zone

## Deployment steps
1. Fork & Clone the repository
2. Install the project dependencies `npm i`
3. Set the required environment variable `DOMAIN_NAME` to your custom domain. Examples:
    * Windows/CMD - `set DOMAIN_NAME=domain.com`
    * Bash - `export DOMAIN_NAME=domain.com`
4. Synthesize the Cloudformation template to ensure the configuration is correct `npx cdk synth`
    * Some errors might be thrown if the Route53 Hosted Zone doesn't exist or your current AWS role laks the proper access to it
5. Deploy the application `npx cdk deploy`
6. (Optional) Delete the applcation once you're done using it `npx cdk destroy`

## Using the API
1. Retrieve the following values of the Stack Outputs printed during the deployment in the previous step
    * `UrlShortenerCustomMetricsStack.APIKeyID` --> You'll need to replace the string `<api-key-id>` with the value returned
    * `UrlShortenerCustomMetricsStack.customAPIUrlOutput` --> You'll need to replace the `<your_url>` with the value returned
2. Retrieve the API Key value and use it to replace the `<api-key-value>` in the following examples, some options to do so would be:
    * Navigate to the AWS Console and retrieve it manually
    * Execute the following AWS CLI command `aws apigateway get-api-key --api-key <api-key-id> --include-value --query "value" --output text`
3. Create your first redirection URL
    ```bash
        curl --location 'https://<your_url>/exmaple' \
        --header 'Content-Type: application/json' \
        --header 'x-api-key: <api-key-value>' \
        --data '{
            "originalURL": "https://lhidalgo.dev/url-shortener-custom-metrics",
            "ttlInSeconds": 360000
        }'
    ```
4. The previous curl command will return the redirection URL as part of its body, the response should be `"https://<your_url>/exmaple"`
5. Open that link on any browser and you'll be redirected to the url you sent as `originalURL` in the previous request
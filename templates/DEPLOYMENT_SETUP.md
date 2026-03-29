# Deployment Setup Guide

This guide walks you through setting up automated deployment of templates to Cloudflare R2 using GitHub Actions.

## 🔧 Prerequisites

1. **Cloudflare Account** with R2 enabled
2. **GitHub Repository** with this template code
3. **R2 Bucket** created in your Cloudflare account

## 📋 Step-by-Step Setup

### Step 1: Create a Cloudflare R2 Bucket

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2 Object Storage** in the sidebar
3. Click **Create bucket**
4. Choose a unique bucket name (e.g., `my-cloudflare-templates`)
5. Select a location (use "Automatic" for optimal performance)
6. Click **Create bucket**

### Step 2: Create R2 API Token

1. In the Cloudflare Dashboard, go to **R2 Object Storage**
2. Click **Manage R2 API tokens** (under Account details)
3. Click **Create API token**
4. Configure the token:
   - **Token name**: `GitHub Actions Template Deployment`
   - **Permissions**: Select **Object Read and Write**
   - **Bucket**: Select your bucket (e.g., `my-cloudflare-templates`)
   - **TTL**: Leave default or set to "Custom" for longer validity
5. Click **Create API Token**
6. **Important**: Copy the **Access Key ID** and **Secret Access Key** immediately - you won't see them again!

### Step 3: Get Your Cloudflare Account ID

1. In the Cloudflare Dashboard, go to the right sidebar
2. Under **Account details**, copy your **Account ID**

### Step 4: Configure GitHub Repository Secrets

1. Go to your GitHub repository
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** and add the following secrets:

#### Required Secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `R2_ACCOUNT_ID` | Your Cloudflare Account ID | Found in Dashboard sidebar |
| `R2_ACCESS_KEY_ID` | Your R2 API Token Access Key | From Step 2 |
| `R2_SECRET_ACCESS_KEY` | Your R2 API Token Secret Key | From Step 2 |
| `R2_BUCKET_NAME` | Your bucket name | e.g., `my-cloudflare-templates` |

#### Example Configuration:

```
R2_ACCOUNT_ID = "abcd1234efgh5678ijkl9012mnop3456"
R2_ACCESS_KEY_ID = "your-access-key-id-here"
R2_SECRET_ACCESS_KEY = "your-secret-access-key-here"
R2_BUCKET_NAME = "my-cloudflare-templates"
```

### Step 5: Enable R2 Public Access (Optional)

If you want your templates to be publicly accessible via HTTP:

1. Go to your R2 bucket in the Cloudflare Dashboard
2. Click **Settings** tab
3. Under **Public access**, click **Allow Access**
4. Your templates will be available at:
   - **Catalog**: `https://your-bucket-name.r2.dev/template_catalog.json`
   - **Templates**: `https://your-bucket-name.r2.dev/templates/template-name.zip`

### Step 6: Test the Deployment

1. Push a commit to the `main` branch of your repository
2. Go to **Actions** tab in your GitHub repository
3. Watch the "Deploy Templates to Cloudflare R2" workflow run
4. Check the deployment summary for success status

## 🎯 What the Workflow Does

The GitHub Actions workflow automatically:

1. **Triggers** on every push to the `main` branch
2. **Generates** the template catalog JSON using your Python script
3. **Creates optimized zip files** for each template with:
   - Maximum compression for smaller file sizes
   - Exclusion of unnecessary files (`node_modules`, `.git`, etc.)
   - Fast unzip capability
4. **Uploads** all files to your R2 bucket:
   - `template_catalog.json` in the root
   - Template zip files in `/templates/` folder
5. **Verifies** all uploads completed successfully
6. **Provides** a deployment summary with access URLs

## 📁 R2 Bucket Structure

After deployment, your R2 bucket will have this structure:

```
your-bucket-name/
├── template_catalog.json
└── templates/
    ├── c-code-next-runner.zip
    ├── c-code-react-runner.zip
    ├── next-llm-chat-runner.zip
    └── vite-cfagents-runner.zip
```

## 🔒 Security Best Practices

1. **Never commit secrets** to your repository
2. **Use repository secrets** for all sensitive information
3. **Limit API token permissions** to only what's needed (Object Read & Write)
4. **Scope tokens to specific buckets** rather than account-wide access
5. **Consider token expiration** for enhanced security
6. **Monitor usage** in the Cloudflare Dashboard

## 🐛 Troubleshooting

### Common Issues:

#### "Access Denied" Error
- **Cause**: Incorrect API credentials or insufficient permissions
- **Solution**: Verify your `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are correct

#### "Bucket Not Found" Error
- **Cause**: Incorrect bucket name or bucket doesn't exist
- **Solution**: Check your `R2_BUCKET_NAME` secret matches your actual bucket name

#### "Invalid Account ID" Error  
- **Cause**: Wrong account ID in secrets
- **Solution**: Verify your `R2_ACCOUNT_ID` matches your Cloudflare account

#### Workflow Fails on Upload
- **Cause**: Network issues or rate limiting
- **Solution**: Re-run the workflow, or check Cloudflare status page

### Getting Help:

1. Check the **Actions** tab for detailed error logs
2. Verify all secrets are set correctly in repository settings
3. Ensure your R2 bucket exists and API token is valid
4. Check Cloudflare R2 billing limits if uploads fail

## 🚀 Manual Deployment

You can also trigger deployment manually:

1. Go to **Actions** tab in your repository
2. Select "Deploy Templates to Cloudflare R2" workflow
3. Click **Run workflow**
4. Choose the branch (usually `main`) and click **Run workflow**

## 📊 Monitoring

Monitor your deployments:

1. **GitHub Actions**: Check workflow runs and logs
2. **Cloudflare Dashboard**: Monitor R2 bucket usage and requests
3. **R2 Analytics**: View bandwidth and request metrics

---

## 🎉 You're All Set!

Once configured, every commit to `main` will automatically:
- ✅ Generate fresh template catalog
- ✅ Create optimized zip files  
- ✅ Upload everything to R2
- ✅ Provide public access URLs

Your templates are now ready for automated deployment! 🚀

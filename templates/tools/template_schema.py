#!/usr/bin/env python3
"""
Template Schema Definition

Defines the schema for template YAML configuration files.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
import yaml


@dataclass
class FrameworkConfig:
    """Framework configuration"""
    type: str  # "react", "nextjs", "vue", etc.
    version: Optional[str] = None
    bundler: Optional[str] = None  # "vite", "webpack", "next", etc.
    bundler_version: Optional[str] = None
    router: Optional[str] = None  # "pages", "app", "client-side", etc.


@dataclass
class CloudflareConfig:
    """Cloudflare integrations configuration"""
    integrations: List[str] = field(default_factory=list)
    deployment: str = "static"  # "static", "workers", "opennext"


@dataclass
class OverrideConfig:
    """Template override configuration"""
    package_json_patches: Dict[str, Any] = field(default_factory=dict)
    wrangler_config: Dict[str, Any] = field(default_factory=dict)
    file_replacements: Dict[str, str] = field(default_factory=dict)
    additional_dependencies: Dict[str, str] = field(default_factory=dict)


@dataclass
class TemplateConfig:
    """Complete template configuration"""
    name: str
    display_name: str
    description: str
    base_reference: str
    framework: FrameworkConfig
    cloudflare: CloudflareConfig
    features: List[str] = field(default_factory=list)
    overrides: OverrideConfig = field(default_factory=lambda: OverrideConfig())

    @classmethod
    def from_yaml(cls, yaml_content: str) -> 'TemplateConfig':
        """Create TemplateConfig from YAML string"""
        data = yaml.safe_load(yaml_content)
        
        # Convert framework config
        framework_data = data.get('framework', {})
        framework = FrameworkConfig(**framework_data)
        
        # Convert cloudflare config
        cloudflare_data = data.get('cloudflare', {})
        cloudflare = CloudflareConfig(**cloudflare_data)
        
        # Convert overrides config
        overrides_data = data.get('overrides', {})
        overrides = OverrideConfig(**overrides_data)
        
        return cls(
            name=data['name'],
            display_name=data['display_name'],
            description=data['description'],
            base_reference=data['base_reference'],
            framework=framework,
            cloudflare=cloudflare,
            features=data.get('features', []),
            overrides=overrides
        )

    @classmethod
    def from_file(cls, yaml_file: str) -> 'TemplateConfig':
        """Create TemplateConfig from YAML file"""
        with open(yaml_file, 'r', encoding='utf-8') as f:
            return cls.from_yaml(f.read())


def validate_template_config(config: TemplateConfig) -> List[str]:
    """
    Validate a template configuration and return list of errors.
    
    Returns:
        List of validation error messages (empty if valid)
    """
    errors = []
    
    # Required fields validation
    if not config.name:
        errors.append("Template name is required")
    
    if not config.base_reference:
        errors.append("Base reference template is required")
    
    if not config.framework.type:
        errors.append("Framework type is required")
    
    # Name validation
    if config.name and not config.name.endswith('-runner'):
        errors.append("Template name must end with '-runner'")
    
    # Framework validation
    valid_frameworks = ['react', 'nextjs', 'vue', 'angular', 'svelte']
    if config.framework.type not in valid_frameworks:
        errors.append(f"Framework type must be one of: {', '.join(valid_frameworks)}")
    
    # Cloudflare integration validation
    valid_integrations = [
        'workers', 'durable-objects', 'kv', 'r2', 'd1', 'queues',
        'ai-gateway', 'agents', 'mcp', 'vectorize', 'hyperdrive'
    ]
    for integration in config.cloudflare.integrations:
        if integration not in valid_integrations:
            errors.append(f"Unknown Cloudflare integration: {integration}")
    
    return errors
We're in the process of a major dependency update, migrating from '@hyperleder/aries-bifold-core' to '@bifold/core'.

Many src files need to be updated to use imports from '@bifold/core' and other '@bifold/*' packages.

The project itself heavily relies on bifold components, but also introduces a lot of custom screens (rendered independently or injected to Bifold via DI container).

The scope of current tasks is 'heka-wallet' - do not look into other high-level folders 'heka-*'.
@{
    # Include default rules
    IncludeDefaultRules = $true

    # Exclude rules that are too noisy or not applicable
    ExcludeRules = @(
        'PSUseApprovedVerbs',
        'PSAvoidUsingPositionalParameters',
        'PSAvoidUsingCmdletAliases'
    )

    # Custom rule configurations
    Rules = @{
        # Treat as errors (fail CI/pre-commit)
        PSAvoidAssignmentToAutomaticVariable = @{
            Severity = 'Error'
        }
        PSUseDeclaredVarsMoreThanAssignments = @{
            Severity = 'Error'
        }
        PSAvoidUsingEmptyCatchBlock = @{
            Severity = 'Error'
        }
        # Treat as warnings (don't block commit)
        PSAvoidUsingWriteHost = @{
            Severity = 'Warning'
        }
        PSUseShouldProcessForStateChangingFunctions = @{
            Severity = 'Warning'
        }
    }
}

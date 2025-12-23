<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Plugin\Email;

use Magento\Email\Model\Template;

/**
 * Prevent null template subjects from crashing template filtering.
 *
 * Some third-party tooling (e.g. email previewers) calls Template::getSubject()
 * without ensuring the default template is loaded, which can leave template_subject null.
 */
class TemplateSubjectFallbackPlugin
{
    /**
     * @param Template $subject
     * @param callable $proceed
     * @param array $variables
     * @return string
     */
    public function aroundGetProcessedTemplateSubject(Template $subject, callable $proceed, array $variables): string
    {
        // If subject is null, try loading default template by ID (template code).
        if (null === $subject->getTemplateSubject()) {
            $templateId = $subject->getId();

            // Only attempt loadDefault for non-numeric template identifiers (file-based templates).
            if (is_string($templateId) && $templateId !== '' && !is_numeric($templateId)) {
                try {
                    $subject->loadDefault($templateId);
                } catch (\Throwable $e) {
                    // Ignore; we'll fall back to empty string below.
                }
            }

            // Absolute fallback to empty subject to avoid Template::filter(NULL).
            if (null === $subject->getTemplateSubject()) {
                $subject->setTemplateSubject('');
            }
        }

        return (string)$proceed($variables);
    }
}


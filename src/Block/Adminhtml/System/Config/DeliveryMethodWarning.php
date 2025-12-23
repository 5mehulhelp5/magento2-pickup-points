<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Block\Adminhtml\System\Config;

use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Block tDo show warning when carrier is not enabled
 */
class DeliveryMethodWarning extends Field
{
    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @param \Magento\Backend\Block\Template\Context $context
     * @param ScopeConfigInterface $scopeConfig
     * @param array $data
     * @param \Magento\Framework\View\Helper\SecureHtmlRenderer|null $secureRenderer
     */
    public function __construct(
        \Magento\Backend\Block\Template\Context $context,
        ScopeConfigInterface $scopeConfig,
        array $data = [],
        ?\Magento\Framework\View\Helper\SecureHtmlRenderer $secureRenderer = null
    ) {
        parent::__construct($context, $data, $secureRenderer);
        $this->scopeConfig = $scopeConfig;
    }

    /**
     * Render field HTML
     *
     * @param AbstractElement $element
     * @return string
     */
    protected function _getElementHtml(AbstractElement $element)
    {
        try {
            // Get current store/website scope
            $storeId = $this->getRequest() ? $this->getRequest()->getParam('store', null) : null;
            $websiteId = $this->getRequest() ? $this->getRequest()->getParam('website', null) : null;

            // Determine scope
            $scope = ScopeInterface::SCOPE_STORE;
            $scopeCode = $storeId;

            if ($websiteId && !$storeId) {
                $scope = ScopeInterface::SCOPE_WEBSITE;
                $scopeCode = $websiteId;
            }

            // Check if carrier is enabled
            $carrierActive = $this->scopeConfig->isSetFlag(
                'carriers/innosend_pickup_points/active',
                $scope,
                $scopeCode
            );

            // If carrier is not enabled, show warning
            if (!$carrierActive) {
                $warningMessage = '<div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 10px 0;">' .
                    '<strong style="color: #856404; font-size: 14px;">⚠ Warning:</strong> ' .
                    '<p style="color: #856404; margin: 10px 0 0 0; line-height: 1.5;">' .
                    'The "Innosend Pickup Points" shipping method is not enabled. ' .
                    'Please enable it in <strong>Stores > Configuration > Sales > Shipping Methods > Innosend Pickup Points</strong> ' .
                    'when enabling this feature.</p>' .
                    '</div>';
                $element->setText($warningMessage);
            } else {
                // If carrier is enabled, show success message
                $successMessage = '<div style="background-color: #d4edda; border: 1px solid #28a745; border-radius: 4px; padding: 15px; margin: 10px 0;">' .
                    '<strong style="color: #155724; font-size: 14px;">✓ Success:</strong> ' .
                    '<p style="color: #155724; margin: 10px 0 0 0; line-height: 1.5;">' .
                    'The "Innosend Pickup Points" shipping method is enabled. ' .
                    'Configure delivery methods in <strong>Stores > Configuration > Sales > Delivery Methods</strong>.</p>' .
                    '</div>';
                $element->setText($successMessage);
            }
        } catch (\Exception $e) {
            // Silently fail if there's an error
            // Just render the element normally
        }

        return parent::_getElementHtml($element);
    }
}

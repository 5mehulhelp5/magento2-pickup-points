<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Observer;

use Innosend\PickupPoints\Helper\ShippingInformation;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\DataObject;
use Magento\Framework\Escaper;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Model\Order\Address\Renderer as AddressRenderer;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

/**
 * Replace shipping address in order confirmation email with pickup point info
 * when shipping method is Innosend pickup points.
 */
class EmailOrderSetTemplateVarsBefore implements ObserverInterface
{
    private ResourceConnection $resourceConnection;
    private ShippingInformation $shippingInformation;
    private AddressRenderer $addressRenderer;
    private Escaper $escaper;
    private LoggerInterface $logger;

    public function __construct(
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation,
        AddressRenderer $addressRenderer,
        Escaper $escaper,
        LoggerInterface $logger
    ) {
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
        $this->addressRenderer = $addressRenderer;
        $this->escaper = $escaper;
        $this->logger = $logger;
    }

    public function execute(Observer $observer): void
    {
        /** @var DataObject|null $transport */
        $transport = $observer->getData('transportObject') ?: $observer->getData('transport');
        if (!$transport) {
            return;
        }

        $order = $transport->getData('order');
        if (!$order instanceof Order) {
            return;
        }

        if ($order->getIsVirtual()) {
            return;
        }

        // Normalize order_data for strict templates and preview tools (e.g. EmailTester2),
        // which sometimes set order_data to an Order object instead of the expected array.
        $orderDataRaw = $transport->getData('order_data');
        if ($orderDataRaw instanceof DataObject) {
            $orderData = $orderDataRaw->getData();
        } elseif (is_array($orderDataRaw)) {
            $orderData = $orderDataRaw;
        } else {
            $orderData = [];
        }

        // Ensure keys expected by core templates exist (StrictResolver will warn if missing).
        $orderData += [
            'customer_name' => $order->getCustomerName(),
            'is_not_virtual' => (int)$order->getIsNotVirtual(),
            'email_customer_note' => $order->getEmailCustomerNote(),
            'frontend_status_label' => $order->getFrontendStatusLabel(),
        ];
        $transport->setData('order_data', $orderData);

        // Ensure formattedShippingAddress exists (EmailTester2 preview doesn't set it).
        if (!$transport->hasData('formattedShippingAddress') || $transport->getData('formattedShippingAddress') === null) {
            try {
                $transport->setData(
                    'formattedShippingAddress',
                    $this->addressRenderer->format($order->getShippingAddress(), 'html')
                );
            } catch (\Throwable $e) {
                // Keep it null if address cannot be formatted
            }
        }

        $shippingMethod = (string)$order->getShippingMethod();
        $isPickupPoints = ($shippingMethod !== '' && strpos($shippingMethod, 'innosend_pickup_points') === 0);

        if (!$isPickupPoints) {
            return;
        }

        // For pickup points: force-enable shipping sections and replace the shipping address.
        $orderData['is_not_virtual'] = 1;
        $transport->setData('order_data', $orderData);

        $pickupPointData = $this->getPickupPointData((int)$order->getId());
        if (!$pickupPointData) {
            return;
        }

        $formatted = $this->renderPickupPointAsHtmlAddress($pickupPointData);
        if ($formatted === '') {
            return;
        }

        $transport->setData('formattedShippingAddress', $formatted);
    }

    private function getPickupPointData(int $orderId): ?array
    {
        try {
            $connection = $this->resourceConnection->getConnection();
            $tableName = $this->resourceConnection->getTableName('fm_innosend_order');

            if (!$connection->isTableExists($tableName)) {
                return null;
            }

            $select = $connection->select()
                ->from($tableName, 'shipping_information')
                ->where('order_id = ?', $orderId);

            $shippingInformationJson = $connection->fetchOne($select);
            if (!$shippingInformationJson) {
                return null;
            }

            $shippingInformation = $this->shippingInformation->parseShippingInformation($shippingInformationJson);
            return $this->shippingInformation->extractPickupPoint($shippingInformation);
        } catch (\Throwable $e) {
            $this->logger->error('Innosend Pickup Points: Failed to load pickup point data for email', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Build HTML similar to Magento address renderer output.
     *
     * Desired output (line breaks):
     * POSTNL Pickup Point:
     *
     * <strong>Name</strong>
     * Street
     * City
     */
    private function renderPickupPointAsHtmlAddress(array $pickupPointData): string
    {
        $carrier = trim((string)($pickupPointData['pickup_point_carrier'] ?? ''));
        $name = trim((string)($pickupPointData['pickup_point_name'] ?? ''));
        $address = trim((string)($pickupPointData['pickup_point_address'] ?? ''));

        if ($name === '' && $address === '') {
            return '';
        }

        $carrierUpper = $carrier !== '' ? strtoupper($carrier) . ' ' : '';
        $header = $carrierUpper . (string)__('Pickup Point:');

        // Address formatting: split on FIRST comma only; remove any extra commas from remainder
        $street = '';
        $city = '';
        if ($address !== '') {
            $parts = array_map('trim', explode(',', $address, 2));
            $street = $parts[0] ?? '';
            $city = isset($parts[1]) ? str_replace(',', '', $parts[1]) : '';
        }

        $lines = [];
        $lines[] = $this->escaper->escapeHtml($header);
        $lines[] = ''; // empty line
        if ($name !== '') {
            $lines[] = '<strong>' . $this->escaper->escapeHtml($name) . '</strong>';
        }
        if ($street !== '') {
            $lines[] = $this->escaper->escapeHtml($street);
        }
        if ($city !== '') {
            $lines[] = $this->escaper->escapeHtml($city);
        }

        // Join with <br/> like Magento formatted address
        return implode("<br/>\n", $lines);
    }
}

